import { request } from './utils';
import { groupBy } from 'lodash';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
export default async (trello, db, config) => {
  console.log('comment-actions');
  const { sequelize } = db;
  const { Trello, Action, Project, Employee, Role } = sequelize.models;

  const { get, post, put, del } = request(trello);

  const boards = await get('/1/member/me/boards');

  let cards = [];
  for (const board of boards) {
    cards = cards.concat(await get(`/1/board/${board.id}/cards?actions=commentCard`));
  }

  for (const card of cards) {
    const trelloInstance = await Trello.findOne({
      where: {
        trelloId: card.id
      }
    });

    if (!trelloInstance) continue;

    const model = trelloInstance.type === 'project' ? Project : Role;
    const actions = await Action.findAll({
      include: [{
        model,
        where: {
          id: trelloInstance.modelId
        }
      }, Employee]
    });

    const now = new Date();
    const [month, year] = [now.getMonth(), now.getFullYear()];
    const comments = card.actions;
    const comment = comments.find(cmt => {
      const d = new Date(cmt.date);

      return cmt.idMemberCreator === config.trello.user.id &&
      cmt.data.text && cmt.data.text.startsWith('Actions') &&
      d.getMonth() === month && d.getFullYear() === year;
    });

    if (!actions.length) {
      if (comment) {
        await del(`/1/actions/${comment.id}`);
      }
      continue;
    }

    const employees = groupBy(actions, action =>
      `${action.Employee.firstname} ${action.Employee.lastname}`
    );
    const list = Object.keys(employees).map(key => {
      const employeeActions = employees[key];

      const actionList = employeeActions.map(action => {
        const day = new Date(action.date).getDate();
        const name = action.name;
        let postfix;

        switch (day) {
          case 1:
            postfix = 'st';
            break;
          case 2:
            postfix = 'nd';
            break;
          default:
            postfix = 'th';
        }

        return `    · ${day}${postfix} day – ${name}`;
      });

      return `${key}\n${actionList}`;
    });

    const text = `Actions for ${MONTHS[month]} ${year}\n${list}`;

    if (!comment) {
      await post(`/1/cards/${card.trelloId}/actions/comments`, { text });
    } else {
      await put(`/1/actions/${comment.id}`, { text });
    }
  }
};
