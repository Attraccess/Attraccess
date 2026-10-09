export type MockQueryBuilder = {
  where: jest.Mock;
  andWhere: jest.Mock;
  getOne: jest.Mock;
  insert: jest.Mock;
  into: jest.Mock;
  values: jest.Mock;
  execute: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
};
