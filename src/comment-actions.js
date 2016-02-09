import { request } from './utils';
import { groupBy } from 'lodash';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
export default async (trello, db, config) => {
  const { sequelize } = db;
  const { Trello, Action, Project, Employee, Role } = sequelize.models;

  const { get, post, put } = request(trello);

  const cards = await Trello.findAll({
    where: {
      type: {
        $in: ['project', 'role']
      }
    }
  });

  cards.forEach(async card => {
    const model = card.type === 'project' ? Project : Role;
    const actions = await Action.findAll({
      include: [{
        model,
        where: {
          id: card.modelId
        }
      }, Employee]
    }) || [];

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

    if (!comment) {
      await post(`/1/cards/${card.trelloId}/actions/comments`, { text });
    } else {
      await put(`/1/actions/${comment.id}`, { text });
    }
  });
};
