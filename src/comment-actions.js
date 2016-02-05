import promisify from 'pify';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
export default async (trello, db, config) => {
  console.log('comment actions');
  const { sequelize } = db;
  const { Trello, Action, Project, Employee } = sequelize.models;

  const get = promisify(trello.get.bind(trello));
  const post = promisify(trello.post.bind(trello));
  const put = promisify(trello.put.bind(trello));

  const cards = await Trello.findAll({
    where: {
      type: 'project'
    }
  });

  cards.forEach(async card => {
    const actions = await Action.findAll({
      include: [{
        model: Project,
        where: {
          id: card.modelId
        }
      }, Employee]
    });

    if (!actions.length) return;

    const list = actions.map(action => {
      const employee = action.Employee;
      return `@${employee.username} ${employee.firstname} ${employee.lastname} – ${action.name}`;
    }).join('\n');

    const now = new Date();
    const [month, year] = [now.getMonth(), now.getFullYear()];
    const text = `Actions for ${MONTHS[month]} ${year}\n${list}`;

    const comments = await get(`/1/cards/${card.trelloId}/actions`);
    const comment = comments.find(cmt => {
      const d = new Date(cmt.date);

      return cmt.idMemberCreator === config.trello.user.id &&
      cmt.data.text && cmt.data.text.startsWith('Actions') &&
      d.getMonth() === month && d.getFullYear() === year;
    });
    // console.log('Comment', comment);

    if (!comment) {
      await post(`/1/cards/${card.trelloId}/actions/comments`, { text });
    } else {
      await put(`/1/actions/${comment.id}`, { text });
    }
  });
  console.log('COMMENT ACTIONS COMPLETE!');
};
