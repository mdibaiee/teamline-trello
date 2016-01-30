import Trello from 'trello';

const notClosed = a => !a.closed;

export default async (db, config = {}) => {
  const APP = config.sync.trello.app;
  const USER = config.sync.trello.user;

  if (!APP || !USER) {
    throw new Error('Please set sync.trello.app and user.');
  }

  const trello = new Trello(APP, USER);

  const boards = (await trello.getBoards('me')).filter(notClosed);
  const { Company, Team, Employee, Project } = db.sequelize.models; // eslint-disable-line
  let users = [];

  for (const board of boards) {
    Team.findOrCreate({
      where: {
        name: board.name
      }
    });

    users = users.concat(await trello.getBoardMembers(board.id));

    try {
      const lists = (await trello.getListsOnBoard(board.id)).filter(notClosed);

      await* lists.map(async list => { // eslint-disable-line
        const cards = (await trello.getCardsOnList(list.id)).filter(notClosed);

        cards.forEach(async card => {
          await Project.findOrCreate({
            where: {
              name: card.name
            }
          });

          card.idMembers.forEach(async id => {
            const user = users.find(a => a.id === id);
            await Employee.findOne({
              where: {
                username: user.username
              }
            });
          });
        });
      });
    } catch (e) {
      console.error('E', e);
    }
  }
};
