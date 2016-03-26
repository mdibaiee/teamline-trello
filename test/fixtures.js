// FIXTURES
export const USERS = [{
  id: 'test_id',
  username: 'test_name',
  fullName: 'Mr Test',
  idBoards: ['test_board_id']
}, {
  id: 'test_other_id',
  username: 'test_other_name',
  fullName: 'Ms Test',
  idBoards: ['test_board_id']
}];
export const USER = USERS[0]; // /members/me

export const BOARDS = [{
  name: 'test',
  id: 'test_board_id',
  idMembers: [USER.id],
  memberships: [{
    idMember: USER.id,
    memberType: 'admin'
  }],
  closed: false
}, {
  name: 'test_2',
  id: 'test_other_board_id',
  idMembers: [USER.id, USERS[1].id],
  memberships: [{
    idMember: USER.id,
    memberType: 'admin'
  }, {
    idMember: USERS[1].id,
    memberType: 'normal'
  }],
  closed: false
}, {
  name: 'test_3',
  id: 'test_closed_board',
  idMembers: [],
  memberships: [],
  closed: true
}];

export const CARDS = [{
  name: 'something',
  id: 'test_card',
  desc: 'cool',
  closed: false,
  idMembers: [USER.id]
}, {
  name: 'else',
  id: 'test_other_card',
  desc: 'cool 2',
  closed: false,
  idMembers: [USER.id, USERS[1].id]
}, {
  name: 'other',
  id: 'test_the_other_card',
  desc: 'cool 3',
  closed: false,
  idMembers: []
}];

export const LISTS = [{
  name: 'todo',
  id: 'test_list',
  cards: [CARDS[0]],
  idBoard: BOARDS[1].id,
  closed: false
}, {
  name: 'doing',
  id: 'test_other_list',
  cards: [CARDS[1]],
  idBoard: BOARDS[1].id,
  closed: false
}, {
  name: 'done',
  id: 'test_the_other_list',
  cards: [CARDS[2]],
  idBoard: BOARDS[1].id,
  closed: false
}];
