import { request, logger } from './utils';

const notClosed = a => !a.closed;
export default async (trello, db, config) => {
  const { log, error } = logger(config);

  log('[sync, trello] Syncing...');
  const { sequelize } = db;
  const { Trello, Project, Employee, Team, Role, Goal } = sequelize.models;

  const related = a => config.trello.lists.some(b => new RegExp(b, 'i').test(a.name));

  const { get, post } = request(trello);

  const boards = (await get('/1/members/me/boards'))
                  .filter(notClosed);

  const teamBoards = boards.filter(b => !b.name.toLowerCase().includes('roles'));
  const roleBoard = boards.find(b => b.name.toLowerCase().includes('roles'));
  const opts = { hooks: false };

  {
    const teams = await Team.scope('open').findAll();
    for (const team of teams) {
      const tb = await Trello.findOne({
        where: {
          modelId: team.id,
          type: 'team',
        },
      });

      try {
        const r = tb ? await get(`/1/boards/${tb.trelloId}`) : null;

        if (!tb || r.closed) {
          await team.update({
            closed: true,
          }, opts);
          if (tb) await tb.destroy(opts);
        }
      } catch (e) { // request failed, no such board exists on Trello
        await team.update({
          closed: true,
        }, opts);
      }
    }
  }

  for (const board of teamBoards) {
    const trelloBoard = await Trello.findOne({
      where: {
        trelloId: board.id,
        type: 'team',
      },
    });

    let team;
    if (trelloBoard) {
      team = await Team.findOne({
        where: {
          id: trelloBoard.modelId,
        },
      });

      if (!team) {
        await trelloBoard.destroy(opts);
        continue;
      }

      await team.update({
        name: board.name,
      }, opts);
    } else {
      team = await Team.create({
        name: board.name,
      }, opts);

      Trello.create({
        trelloId: board.id,
        modelId: team.id,
        type: 'team',
      }, opts);
    }

    const boardMembers = await get(`/1/boards/${board.id}/members`);

    await team.setManagers([]);

    for (const member of boardMembers) {
      const emp = await Employee.findOne({
        where: sequelize.or(
          sequelize.where(sequelize.col('username'), member.username),
          sequelize.where(
            sequelize.fn('concat',
              sequelize.col('firstname'),
              ' ',
              sequelize.col('lastname')
            ),
            member.fullName
          )
        ),
      });
      if (!emp) {
        member.employee = null;
        continue;
      }

      member.employee = emp;

      Trello.findOrCreate({
        where: {
          trelloId: member.id,
          modelId: emp.id,
          type: 'employee',
        },
        hooks: false,
      });

      await team.addEmployee(emp, opts);

      const type = board.memberships.find(a => a.idMember === member.id).memberType;
      if (type === 'admin') {
        await team.addManager(emp, opts);
      }
    }

    try {
      const lists = (await get(`/1/boards/${board.id}/lists?cards=all`))
                    .filter(notClosed).filter(related);

      const projectLists = lists.filter(a => !/goal/i.test(a.name));
      const goalLists = lists.filter(a => /goal/i.test(a.name));

      for (const list of projectLists) {
        const match = list.name.match(/todo|doing|done/i);
        const state = match ? match[0].toLowerCase() : null;
        const cards = list.cards.filter(notClosed);

        cards.forEach(async card => { // eslint-disable-line
          const previousVersion = await Trello.findOne({
            where: {
              type: 'project',
              trelloId: card.id,
            },
          });

          let project;
          if (!previousVersion) {
            [project] = await Project.findOrCreate({
              where: {
                name: card.name,
                description: card.desc,
                state,
              },
              hooks: false,
            });

            Trello.findOrCreate({
              where: {
                trelloId: card.id,
                modelId: project.id,
                type: 'project',
              },
              hooks: false,
            });
          } else {
            project = await Project.findOne({
              where: {
                id: previousVersion.modelId,
              },
            });

            await project.update({
              name: card.name,
              description: card.desc,
              state,
            }, opts);
          }

          await project.setTeam(team, opts);

          await project.setEmployees([], opts);
          for (const id of card.idMembers) {
            const user = boardMembers.find(a => a.id === id);
            const emp = user.employee;
            if (!emp) continue;

            await emp.addProject(project, opts);
          }
        });
      }

      for (const list of goalLists) {
        const cards = list.cards.filter(notClosed);

        cards.forEach(async card => { // eslint-disable-line
          const previousVersion = await Trello.findOne({
            where: {
              type: 'goal',
              trelloId: card.id,
            },
          });

          let goal;
          if (!previousVersion) {
            [goal] = await Goal.findOrCreate({
              where: {
                name: card.name,
                description: card.desc,
                deadline: card.due,
              },
              hooks: false,
            });

            Trello.findOrCreate({
              where: {
                trelloId: card.id,
                modelId: goal.id,
                type: 'goal',
              },
              hooks: false,
            });
          } else {
            goal = await Goal.findOne({
              where: {
                id: previousVersion.modelId,
              },
            });

            await goal.update({
              name: card.name,
              description: card.desc,
              deadline: card.due,
            }, opts);
          }

          await goal.setTeam(team, opts);

          await goal.setEmployees([], opts);
          for (const id of card.idMembers) {
            const user = boardMembers.find(a => a.id === id);
            const emp = user.employee;
            if (!emp) continue;

            await emp.addGoal(goal, opts);
          }

          const match = /owner:\s*(\S+)/i.exec(card.desc);
          if (match && match[1]) {
            const username = match[1].trim().replace('@', '');
            const emp = await Employee.findOne({
              where: {
                username,
              },
            });

            goal.setOwner(emp);
          }
        });
      }

      // homeless projects
      const projects = await Project.scope('open').findAll({
        include: [{
          model: Team,
          where: {
            id: team.id,
          },
        }],
      });

      for (const project of projects) {
        const hasTrello = await Trello.findOne({
          where: {
            modelId: project.id,
            type: 'project',
          },
        });

        if (hasTrello) continue;

        const list = lists.find(a => a.name.toLowerCase().includes('homeless')) ||
                    await post(`/1/boards/${board.id}/lists`, {
                      name: 'Homeless Projects',
                    });

        const [employee] = await project.getEmployees();
        if (!employee) continue;
        const member = boardMembers.find(mem => mem.employee.id === employee.id);
        if (!member) continue;

        const newCard = await post(`/1/lists/${list.id}/cards`, {
          name: project.name,
          idMembers: [member.id],
        });

        await Trello.create({
          trelloId: newCard.id,
          modelId: project.id,
          type: 'project',
        }, opts);
      }
    } catch (e) {
      error('Teamline Trello sync error:', e);
    }
  }

  if (roleBoard) {
    try {
      const teams = await get(`/1/board/${roleBoard.id}/lists?cards=all`);
      for (const team of teams) {
        const t = await Team.findOne({
          where: {
            name: team.name,
          },
        });

        if (!t) continue;

        const roles = team.cards;
        for (const role of roles) {
          const trelloInstance = await Trello.findOne({
            where: {
              trelloId: role.id,
              type: 'role',
            },
          });

          let r;
          if (trelloInstance) {
            r = await Role.findOne({
              where: {
                id: trelloInstance.modelId,
              },
            });

            await r.update({
              name: role.name,
              description: role.desc,
            }, opts);
          } else {
            r = await Role.create({
              name: role.name,
              description: role.desc,
            }, opts);

            await Trello.create({
              modelId: r.id,
              trelloId: role.id,
              type: 'role',
            }, opts);
          }

          await r.setTeams([t], opts);

          const roleMembers = await r.getEmployees();
          await Promise.all(role.idMembers.map(async memberId => { // eslint-disable-line
            const tr = await Trello.findOne({
              where: {
                trelloId: memberId,
                type: 'employee',
              },
            });

            if (!tr) return;

            const emp = await Employee.findOne({
              where: {
                id: tr.modelId,
              },
            });
            if (!emp) return;

            await emp.addRole(r, opts);
            const rm = roleMembers.find(e => e.id === emp.id);
            if (rm) rm._member = true;
          }));

          roleMembers.filter(e => !e._member).forEach(emp => r.removeEmployee(emp));
        }
      }
    } catch (e) {
      error('Teamline Trello sync roles error: ', e);
    }
  }

  try {
    const trellos = await Trello.findAll();

    for (const t of trellos) {
      let model;
      let trelloModel;

      switch (t.type) {
        case 'project':
          model = Project;
          trelloModel = 'cards';
          break;
        case 'role':
          model = Role;
          trelloModel = 'cards';
          break;
        // case 'employee':
        //   model = Employee;
        //   trelloModel =
        //   break;
        // case 'team':
        //   model = Team;
        //   trelloModel = 'boards';
        //   break;
        default: continue;
      }

      const instance = await model.findOne({
        where: {
          id: t.modelId,
        },
      });

      if (!instance) {
        try {
          await t.destroy(opts);
        } catch (e) {
          //
        }
        continue;
      }

      try {
        const trelloInstance = await get(`/1/${trelloModel}/${t.trelloId}`);
        if (trelloInstance.closed) {
          await instance.update({
            state: 'closed',
          }, opts);
        }
      } catch (e) {
        // not found
        await instance.destroy(opts);
        await t.destroy(opts);
        continue;
      }
    }
  } catch (e) {
    error('Teamline Trello sync removed error:', e);
  }
};
