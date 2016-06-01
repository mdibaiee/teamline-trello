import moment from 'moment';

// FIXTURES
export const USERS = [{
  id: 'test_id',
  username: 'test_name',
  fullName: 'Mr Test',
  idBoards: ['test_board_id'],
}, {
  id: 'test_other_id',
  username: 'test_other_name',
  fullName: 'Ms Test',
  idBoards: ['test_board_id'],
}];
export const USER = USERS[0]; // /members/me

export const BOARDS = [{
  name: 'test',
  id: 'test_board_id',
  idMembers: [USER.id],
  memberships: [{
    idMember: USER.id,
    memberType: 'admin',
  }],
  closed: false,
}, {
  name: 'test_2',
  id: 'test_other_board_id',
  idMembers: [USER.id, USERS[1].id],
  memberships: [{
    idMember: USER.id,
    memberType: 'admin',
  }, {
    idMember: USERS[1].id,
    memberType: 'normal',
  }],
  closed: false,
}, {
  name: 'test_3',
  id: 'test_closed_board',
  idMembers: [],
  memberships: [],
  closed: true,
}, {
  name: 'roles',
  id: 'test_roles_board',
  idMembers: [USER.id, USERS[1].id],
  memberships: [{
    idMember: USER.id,
    memberType: 'admin',
  }, {
    idMember: USERS[1].id,
    memberType: 'normal',
  }],
  closed: false,
}];

export const CARDS = [{
  name: 'something',
  id: 'test_card',
  desc: 'cool',
  closed: false,
  idMembers: [USER.id],
  actions: [],
}, {
  name: 'else',
  id: 'test_other_card',
  desc: 'cool 2',
  closed: false,
  idMembers: [USER.id, USERS[1].id],
  actions: [],
}, {
  name: 'other',
  id: 'test_the_other_card',
  desc: 'cool 3',
  closed: false,
  idMembers: [],
  actions: [],
}, {
  name: 'some role',
  id: 'test_role_card',
  desc: 'some description',
  closed: false,
  idMembers: [USER.id],
  actions: [],
}, {
  name: 'some other role',
  id: 'test_other_role_card',
  desc: 'some other description',
  closed: false,
  idMembers: [USERS[1].id, USER.id],
  actions: [],
}, {
  name: 'some goal',
  id: 'some_goal_card',
  desc: 'owner: test_name',
  closed: false,
  idMembers: [USERS[0].id],
  actions: [],
  due: moment().milliseconds(0).toISOString(),
}];

export const LISTS = [{
  name: 'todo',
  id: 'test_list',
  cards: [CARDS[0]],
  idBoard: BOARDS[1].id,
  closed: false,
}, {
  name: 'doing',
  id: 'test_other_list',
  cards: [CARDS[1]],
  idBoard: BOARDS[1].id,
  closed: false,
}, {
  name: 'done',
  id: 'test_the_other_list',
  cards: [CARDS[2]],
  idBoard: BOARDS[1].id,
  closed: false,
}, {
  name: 'goal',
  id: 'test_goals_list',
  cards: [CARDS[5]],
  idBoard: BOARDS[1].id,
  closed: false,
}, {
  name: 'test',
  id: 'test_team_roles_list',
  cards: [CARDS[3], CARDS[4]],
  idBoard: BOARDS[3].id,
  closed: false,
}, {
  name: 'test_2',
  id: 'test_other_team_roles_list',
  cards: [],
  idBoard: BOARDS[3].id,
  closed: false,
}];
