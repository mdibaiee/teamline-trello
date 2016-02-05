import promisify from 'pify';

const notClosed = a => !a.closed;
export default async (trello, db) => {
  console.log('syncing all');
  const { sequelize } = db;
  const { Trello, Project, Employee, Team } = sequelize.models;

  const get = promisify(trello.get.bind(trello));
  // const post = promisify(trello.post.bind(trello));
  // const put = promisify(trello.put.bind(trello));

  const boards = (await get('/1/members/me/boards'))
                  .filter(notClosed)
                  .filter(b => !b.name.toLowerCase().includes('roles'));

  for (const board of boards) {
    const [team] = await Team.findOrCreate({
      where: {
        name: board.name
      }
    });
    console.log('on', board.name);

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
      // console.log(`Added ${emp.username} to team ${team.name}`);
    }
    // console.log(`Members of ${board.name} = ${boardMembers.length}`);

    try {
      const lists = (await get(`/1/boards/${board.id}/lists`)).filter(notClosed);

      await* lists.map(async list => { // eslint-disable-line
        const cards = (await get(`/1/lists/${list.id}/cards`)).filter(notClosed);

        cards.forEach(async card => {
          const previousVersion = await Trello.findOne({
            where: {
              type: 'project',
              trelloId: card.id
            }
          });
          console.log('on card', card.name, !!previousVersion);

          let project;
          if (!previousVersion) {
            [project] = await Project.findOrCreate({
              where: {
                name: card.name
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
            }, { hooks: false });
          }

          card.idMembers.forEach(async id => {
            const user = boardMembers.find(a => a.id === id);
            const emp = user.employee;

            emp.addProject(project);
            project.addEmployee(emp);
            team.addProject(project);
            project.setTeam(team);
          });
          // console.log(`Added employees to project ${card.name} = ${card.idMembers.length}`);
        });
      });
    } catch (e) {
      console.error('Teamline Trello sync error:', e);
    }
  }
  console.log('------SYNC COMPLETE-------');
};
