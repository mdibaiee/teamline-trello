import { request } from './utils';
import commentActions from './comment-actions';

export default async (trello, server, db, config = {}) => {
  const { get, post } = request(trello);
  const { sequelize } = db;
  const USER = config.sync.trello.user;

  const { Role, Team, Employee, Project, Trello } = db.sequelize.models; // eslint-disable-line

  server.route({
    method: 'GET',
    path: config.webhook.path,
    config: {
      auth: false
    },
    handler(req, reply) {
      return reply().code(200);
    }
  });

  server.route({
    method: 'POST',
    path: config.webhook.path,
    config: {
      auth: false
    },
    async handler(req, reply) {
      try {
        const { action } = req.payload;
        const { type, data } = action;
        console.log(type, data);

        switch (type) { //eslint-disable-line
          case 'createCard': {
            const roles = data.board.name.toLowerCase().includes('roles');

            const card = await get(`/1/cards/${data.card.id}`);

            const boardT = await Trello.findOne({
              where: {
                trelloId: data.board.id,
                type: 'team'
              }
            });
            if (!boardT && !roles) break;

            if (roles) {
              const team = await Team.findOne({
                where: {
                  name: data.list.name
                }
              });

              const role = await Role.create({
                name: card.name,
                description: card.desc
              });

              team.addRole(role);
              role.addTeam(team);

              await Trello.create({
                modelId: role.id,
                trelloId: card.id,
                type: 'role'
              });
            } else {
              const match = data.list.name.match(/todo|doing|done/i);
              if (!match && !roles) break;
              const state = match[0].toLowerCase();

              const team = await Team.findOne({
                where: {
                  id: boardT.modelId
                }
              });

              const project = await Project.create({
                name: card.name,
                description: card.desc,
                state
              });

              await Trello.create({
                modelId: project.id,
                trelloId: card.id,
                type: 'project'
              });

              team.addProject(project);
              project.setTeam(team);
            }

            break;
          }
          case 'updateCard':
          case 'deleteCard': {
            const t = await Trello.findOne({
              where: {
                trelloId: data.card.id,
                type: {
                  $or: ['project', 'role']
                }
              }
            });
            if (!t) break;
            const card = await get(`/1/cards/${data.card.id}`);

            const roles = data.board.name.toLowerCase().includes('roles');
            if (roles) {
              const role = await Role.findOne({
                where: {
                  id: t.modelId
                }
              });

              await role.update({
                name: card.name,
                description: card.desc,
                closed: type === 'deleteCard' ? true : card.closed
              });
            } else {
              const project = await Project.findOne({
                where: {
                  id: t.modelId
                }
              });

              let state = project.state;
              // changed list
              if (data.listBefore && data.listAfter) {
                const match = data.listAfter.name.match(/todo|doing|done/i);
                state = match ? match[0].toLowerCase() : 'done';
              }
              state = (card.closed || type === 'deleteCard') ? 'closed' : state;

              await project.update({
                name: card.name,
                description: card.desc,
                state
              });
            }

            break;
          }
          case 'addMemberToCard':
          case 'removeMemberFromCard': {
            const cardT = await Trello.findOne({
              where: {
                trelloId: data.card.id,
                type: {
                  $or: ['project', 'role']
                }
              }
            });
            const memberT = await Trello.findOne({
              where: {
                trelloId: data.idMember,
                type: 'employee'
              }
            });
            if (!cardT || !memberT) break;

            const emp = await Employee.findOne({
              where: {
                id: memberT.modelId
              }
            });

            const roles = data.board.name.toLowerCase().includes('roles');
            if (roles) {
              const role = await Role.findOne({
                where: {
                  id: cardT.modelId
                }
              });

              if (type === 'addMemberToCard') {
                emp.addRole(role);
                role.addEmployee(emp);
              } else {
                emp.removeRole(role);
                role.removeEmployee(emp);
              }
            } else {
              const project = await Project.findOne({
                where: {
                  id: cardT.modelId
                }
              });

              if (type === 'addMemberToCard') {
                project.addEmployee(emp);
              } else {
                project.removeEmployee(emp);
              }
            }

            break;
          }
          case 'removeMemberFromBoard':
          case 'addMemberToBoard':
          case 'makeAdminOfBoard':
          case 'makeNormalMemberOfBoard': {
            const boardT = await Trello.findOne({
              where: {
                trelloId: data.board.id,
                type: 'team'
              }
            });
            const memberT = await Trello.findOne({
              where: {
                trelloId: data.idMember || data.idMemberAdded,
                type: 'employee'
              }
            });

            if (!boardT || !memberT) break;

            const team = await Team.findOne({
              where: {
                id: boardT.modelId
              }
            });
            const employee = await Employee.findOne({
              where: {
                id: memberT.modelId
              }
            });

            if (type === 'removeMemberFromBoard') {
              team.removeEmployee(employee);
              employee.removeTeam(team);
            } else if (type === 'addMemberToBoard') {
              team.addEmployee(employee);
              employee.addTeam(team);

              if (data.memberType === 'admin') {
                team.addManager(employee);
              }
            } else if (type === 'makeAdminOfBoard') {
              team.addManager(employee);
            } else if (type === 'makeNormalMemberOfBoard') {
              team.removeManager(employee);
            }

            break;
          }
          case 'updateBoard': {
            const board = await get(`/1/boards/${data.board.id}`);
            const boardT = await Trello.findOne({
              where: {
                trelloId: data.board.id
              }
            });
            if (!boardT) break;

            const team = await Team.findOne({
              where: {
                id: boardT.modelId
              }
            });
            if (!team) break;

            team.update({
              name: board.name
            });
          }
        }

        return reply().code(200);
      } catch (e) {
        console.error(e);
      }
    }
  });

  const boards = config.trello.user.idBoards;

  const WAIT = 3000;
  setTimeout(async () => {
    const webhooks = await get(`/1/tokens/${USER}/webhooks`);

    boards.forEach(async board => {
      try {
        if (webhooks.find(a => a.idModel === board)) return;
        await post('/1/webhooks/', {
          callbackURL: config.webhook.uri + config.webhook.path,
          idModel: board
        });
      } catch (e) {
        console.log(e);
      }
    });
  }, WAIT);

  let commenting = false;
  const comment = async () => {
    if (commenting) return;
    commenting = true;
    await commentActions(trello, db, config);
    commenting = false;
  };

  const update = async (model, options) => {
    if (!options.model || !options.model.options) return;
    try {
      const modelName = options.model.options.name.singular;

      if (modelName === 'Action') {
        comment();
      }

      if (modelName === 'Project') {
        const previous = await Trello.findOne({
          where: {
            modelId: model.id
          }
        });

        if (previous) return;

        const team = await model.getTeam();
        const employees = await model.getEmployees();
        if (!team || !employees.length) return;

        const boardT = await Trello.findOne({
          where: {
            modelId: team.id,
            type: 'team'
          }
        });

        if (!boardT) return;

        const lists = await get(`/1/board/${boardT.trelloId}/lists`);
        const list = lists.find(a => a.name.toLowerCase().includes('homeless')) ||
          await post(`/1/boards/${boardT.trelloId}/lists`, {
            name: 'Homeless Projects'
          });

        const members = await Promise.all(employees.map(async emp => {
          const t = await Trello.findOne({
            where: {
              modelId: emp.id,
              type: 'employee'
            }
          });

          return t.trelloId;
        }));

        const cards = await get(`/1/lists/${list.id}/cards`);

        if (cards.some(a => a.name === model.name)) return;

        const card = await post(`/1/lists/${list.id}/cards`, {
          name: model.name,
          idMembers: members
        });

        await Trello.create({
          modelId: model.id,
          trelloId: card.id,
          type: 'project'
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const destroy = (model) => {
    const modelName = model.$modelOptions.name.singular;
    if (modelName === 'Action') {
      comment();
    }
  };

  ['afterCreate', 'afterUpdate',
  'afterBulkCreate', 'afterBulkDestroy', 'afterBulkUpdate'].forEach(ev => {
    sequelize.addHook(ev, (model, options) => {
      try {
        update(model, options);
      } catch (e) {
        console.error(e);
      }
    });
  });

  ['afterDestroy', 'afterBulkDestroy'].forEach(ev => {
    sequelize.addHook(ev, (model, options) => {
      try {
        destroy(model, options);
      } catch (e) {
        console.error(e);
      }
    });
  });
};
