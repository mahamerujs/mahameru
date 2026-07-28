import { MagmaResponse, type MagmaContainer } from "@mahameru/magma";

export type User = {
  id: string;
  name: string;
};

export default class UserService {
  protected users = new Map<string, User>();

  constructor(_container: MagmaContainer) {
    this.createBatch([
      {
        name: 'User 1',
      },
      {
        name: 'User 2',
      },
      {
        name: 'User 3',
      },
    ]);
  }

  getAll() {
    return Array.from(this.users.values());
  }

  getOneById(id: string) {
    const found = this.users.get(id);

    if (!found)
      throw MagmaResponse.json(
        {
          success: false,
          message: `User with id ${id} not found`,
        },
        {
          status: 404,
        },
      );

    return found;
  }

  create(user: Omit<User, 'id'>) {
    const latestId = this.users.keys().next().value;
    const nextId = Number(latestId) + 1;
    const id = nextId.toString();

    const newUser: User = {
      id,
      ...user,
    };

    this.users.set(id, newUser);

    return newUser;
  }

  createBatch(users: Omit<User, 'id'>[]) {
    const newUsers: User[] = [...users.map((user) => ({ id: '', ...user }))];
    const latestIdString = this.users.keys().next().value;
    let latestId = latestIdString ? Number(latestIdString) : 0;

    for (const newUser of newUsers) {
      latestId += 1;
      newUser.id = latestId.toString();

      this.users.set(newUser.id, newUser);
    }

    return newUsers;
  }

  updateById(id: string, user: User): User {
    const existingData = this.getOneById(id);

    this.users.set(existingData.id, user);

    return this.getOneById(id);
  }

  deleteById(id: string) {
    const existingData = this.getOneById(id);

    return this.users.delete(existingData.id);
  }
}
