import Trello from 'trello';

export default async (db, config = {}) => {
  const APP = config.sync.trello.app;
  const USER = config.sync.trello.user;

  if (!APP || !USER) {
    throw new Error('Please set sync.trello.app and user.');
  }

  const trello = new Trello(APP, USER);

  const boards = await trello.getBoards('me');
  const { Company, Team, Employee, Project } = db.sequelize.models; // eslint-disable-line

  for (const board of boards) {
    Team.findOrCreate({
      where: {
        name: board.name
      }
    });

    try {
      const lists = await trello.getListsOnBoard(board.id);

      await* lists.map(async list => { // eslint-disable-line
        const cards = await trello.getCardsOnList(list.id);

        cards.forEach(async card => {
          Project.findOrCreate({
            where: {
              name: card.name
            }
          });
        });
      });
    } catch (e) {
      console.error('E', e);
    }
  }
};
