import { request, logger } from './utils';
import { groupBy } from 'lodash';
import moment from 'moment';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
export default async (trello, db, config) => {
  const { log } = logger(config);

  log('comment-actions');
  const { sequelize } = db;
  const { Trello, Action, Project, Employee, Role } = sequelize.models;

  const { get, post, put, del } = request(trello);

  const boards = await get('/1/members/me/boards');

  let cards = [];
  for (const board of boards) {
    cards = cards.concat(await get(`/1/board/${board.id}/cards?actions=commentCard`));
  }

  for (const card of cards) {
    const trelloInstance = await Trello.findOne({
      where: {
        trelloId: card.id,
      },
    });

    if (!trelloInstance) continue;

    const thisMonth = moment().hours(0).minutes(0).seconds(0).date(1);

    const model = trelloInstance.type === 'project' ? Project : Role;
    const actions = await Action.findAll({
      where: {
        date: {
          $gte: thisMonth.toISOString(),
        },
      },
      include: [{
        model,
        where: {
          id: trelloInstance.modelId,
        },
      }, Employee],
    });

    const now = moment();
    const [month, year] = [now.month(), now.year()];
    const comments = card.actions;
    const comment = comments.find(cmt => {
      const d = moment(new Date(cmt.date));

      return cmt.idMemberCreator === config.trello.user.id &&
      cmt.data.text && cmt.data.text.startsWith('Actions') &&
      d.month() === now.month() && d.year() === now.year();
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
          case 3:
            postfix = 'rd';
            break;
          default:
            postfix = 'th';
        }

        return `    · ${day}${postfix} day – ${name}`;
      }).join('\n');

      return `${key}\n${actionList}`;
    }).join('\n\n');

    const text = `Actions for ${MONTHS[month]} ${year}\n${list}`;

    if (comment && text === comment.data.text) continue;

    if (!comment) {
      await post(`/1/cards/${card.id}/actions/comments`, { text });
    } else {
      await put(`/1/actions/${comment.id}`, { text });
    }
  }
};
