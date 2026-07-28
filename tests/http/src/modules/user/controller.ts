import { type MagmaContainer, type MagmaRequest, MagmaResponse } from '@mahameru/magma';
import type { User } from './service';

export default class UserController {
  constructor(protected readonly container: MagmaContainer) {}

  getAllUser() {
    const data = this.container.modules.user.service.getAll();

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  getUserById(_request: MagmaRequest, id: string) {
    const data = this.container.modules.user.service.getOneById(id);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  async createUser(request: MagmaRequest) {
    const user: User = await request.json();
    const data = this.container.modules.user.service.create(user);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  async deleteUser(_request: MagmaRequest, id: string) {
    const data = this.container.modules.user.service.deleteById(id);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  async updateUser(request: MagmaRequest, id: string) {
    const user: User = await request.json();
    const data = this.container.modules.user.service.updateById(id, user);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }
}
