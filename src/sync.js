import promisify from 'pify';
import wait from './wait';

const notClosed = a => !a.closed;
const ONE = 1000;
export default async (trello, db, config) => {
  const { sequelize } = db;
  const { Trello, Project, Employee, Team, Role } = sequelize.models;

  const related = a => config.trello.lists.some(b => new RegExp(b, 'i').test(a.name));

  const get = promisify(trello.get.bind(trello));
  const post = promisify(trello.post.bind(trello));
  // const put = promisify(trello.put.bind(trello));

  const boards = (await get('/1/members/me/boards'))
                  .filter(notClosed);

  const teamBoards = boards.filter(b => !b.name.toLowerCase().includes('roles'));
  const roleBoard = boards.find(b => b.name.toLowerCase().includes('roles'));
  for (const board of teamBoards) {
    const [team] = await Team.findOrCreate({
      where: {
        name: board.name
      }
    });

    Trello.findOrCreate({
      where: {
        trelloId: board.id,
        modelId: team.id,
        type: 'team'
      },
      hooks: false
    });

    const boardMembers = await get(`/1/boards/${board.id}/members`);

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
        )
      });
      if (!emp) continue;

      member.employee = emp;

      Trello.findOrCreate({
        where: {
          trelloId: member.id,
          modelId: emp.id,
          type: 'employee'
        },
        hooks: false
      });

      team.addEmployee(emp);
      emp.addTeam(team);
    }

    try {
      const lists = (await get(`/1/boards/${board.id}/lists`)).filter(notClosed).filter(related);

      for (const list of lists) {
        const match = list.name.match(/todo|doing|done/i);
        const state = match ? match[0].toLowerCase() : null;
        const cards = (await get(`/1/lists/${list.id}/cards`)).filter(notClosed);

        cards.forEach(async card => { // eslint-disable-line
          const previousVersion = await Trello.findOne({
            where: {
              type: 'project',
              trelloId: card.id
            }
          });

          let project;
          if (!previousVersion) {
            [project] = await Project.findOrCreate({
              where: {
                name: card.name,
                state
              },
              hooks: false
            });

            Trello.findOrCreate({
              where: {
                trelloId: card.id,
                modelId: project.id,
                type: 'project'
              },
              hooks: false
            });
          } else {
            project = await Project.findOne({
              where: {
                id: previousVersion.modelId
              }
            });

            await project.update({
              name: card.name,
              state
            }, { hooks: false });
          }

          project.setTeam(team);
          team.addProject(project);

          card.idMembers.forEach(async id => {
            const user = boardMembers.find(a => a.id === id);
            const emp = user.employee;

            emp.addProject(project);
            project.addEmployee(emp);
          });
        });
        await wait(ONE);
      }

      // homeless projects
      const projects = await Project.scope('undone').findAll({
        include: [{
          model: Team,
          where: {
            id: team.id
          }
        }]
      });
      for (const project of projects) {
        const hasTrello = await Trello.findOne({
          where: {
            modelId: project.id,
            type: 'project'
          }
        });

        if (hasTrello) continue;

        const list = lists.find(a => a.name.toLowerCase().includes('homeless'));

        const [employee] = await project.getEmployees();
        const member = boardMembers.find(mem => mem.employee.id === employee.id);

        const newCard = await post(`/1/lists/${list.id}/cards`, {
          name: project.name,
          idMembers: [member.id]
        });

        await Trello.create({
          trelloId: newCard.id,
          modelId: project.id,
          type: 'project'
        });
      }

      await wait(ONE);
    } catch (e) {
      console.error('Teamline Trello sync error:', e);
    }
  }

  try {
    const teams = await get(`/1/board/${roleBoard.id}/lists`);
    for (const team of teams) {
      const t = await Team.findOne({
        where: {
          name: team.name
        }
      });

      if (!t) continue;

      const roles = await get(`/1/list/${team.id}/cards`);
      await* roles.map(async role => { // eslint-disable-line
        let purpose;
        let accountability;
        try {
          purpose = /\*\*purpose\*\*([^*]*)/gi.exec(role.desc)[1];
          accountability = /\*\*accountability\*\*([^*]*)/gi.exec(role.desc)[1];
        } catch (e) {
          //
        }

        const trelloInstance = await Trello.findOne({
          where: {
            trelloId: role.id,
            type: 'role'
          }
        });

        let r;
        if (trelloInstance) {
          r = await Role.findOne({
            where: {
              id: trelloInstance.modelId
            }
          });
        } else {
          r = await Role.create({
            name: role.name
          });

          await Trello.create({
            modelId: r.id,
            trelloId: role.id,
            type: 'role'
          });
        }

        await r.update({
          purpose, accountability, name: role.name
        });

        r.addTeam(t);
        t.addRole(r);

        await* role.idMembers.map(async memberId => {
          const tr = await Trello.findOne({
            where: {
              trelloId: memberId,
              type: 'employee'
            }
          });

          if (!tr) return;

          const emp = await Employee.findOne({
            where: {
              id: tr.modelId
            }
          });
          if (!emp) return;

          emp.addRole(r);
          r.addEmployee(emp);
        });
      });

      await wait(ONE);
    }
  } catch (e) {
    console.error('Teamline Trello sync roles error: ', e);
  }
};
