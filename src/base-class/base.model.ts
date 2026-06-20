import {
    DataSource,
    DeepPartial,
    EntityManager,
    EntityTarget,
    FindManyOptions,
    FindOneOptions,
    FindOptionsOrder,
    FindOptionsRelations,
    FindOptionsWhere,
    Like,
    ObjectLiteral,
    QueryDeepPartialEntity,
    Repository
} from 'typeorm'
import type { ParsedListQuery } from './base.controller.js'

export type CreateBatchOptions = {
    chunkSize?: number
}

export type CreateBatchResult<T extends ObjectLiteral> = {
    totalRecord: number
    totalAdded: number
    failed: {
        data: DeepPartial<T>
        error: unknown
    }[]
}

export type TransactionHandler<TResult> = (manager: EntityManager) => Promise<TResult>

export type BaseModelListOptions<TEntity extends ObjectLiteral> = {
    parsedListQuery: ParsedListQuery<TEntity>
    searchFields?: (keyof TEntity)[]
    relations?: FindOptionsRelations<TEntity>
    where?: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[]
    defaultOrder?: FindOptionsOrder<TEntity>
}

export abstract class BaseModel<TEntity extends ObjectLiteral & { id: string }> {
    private static readonly defaultChunkSize = 500

    constructor(
        protected readonly dataSource: DataSource,
        protected readonly entityTarget: EntityTarget<TEntity>
    ) { }

    protected getRepository(manager?: EntityManager): Repository<TEntity> {
        return (manager ?? this.dataSource.manager).getRepository(this.entityTarget)
    }

    transaction<TResult>(handler: TransactionHandler<TResult>): Promise<TResult> {
        return this.dataSource.transaction(handler)
    }

    async list(options: BaseModelListOptions<TEntity>, manager?: EntityManager) {
        let where = options.where

        if (
            typeof options.parsedListQuery.query === 'string' &&
            options.parsedListQuery.query.trim().length > 0 &&
            options.searchFields &&
            options.searchFields.length > 0
        ) {
            const search = `%${options.parsedListQuery.query.trim()}%`

            where = options.searchFields.map((field) => ({
                [field]: Like(search)
            })) as FindOptionsWhere<TEntity>[]
        }

        const order: FindOptionsOrder<TEntity> | undefined = options.parsedListQuery.sortBy
            ? {
                [options.parsedListQuery.sortBy]: options.parsedListQuery.sortDirection ?? 'ASC'
            } as FindOptionsOrder<TEntity>
            : options.defaultOrder

        const [data, total] = await this.getRepository(manager).findAndCount({
            where,
            take: options.parsedListQuery.limit,
            skip: options.parsedListQuery.offset,
            order,
            relations: options.relations
        })

        return {
            data,
            meta: {
                total,
                limit: options.parsedListQuery.limit,
                offset: options.parsedListQuery.offset,
                hasNext: options.parsedListQuery.offset + data.length < total
            }
        }
    }

    find(options?: FindManyOptions<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).find(options)
    }

    findAndCount(options?: FindManyOptions<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).findAndCount(options)
    }

    findOne(options: FindOneOptions<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).findOne(options)
    }

    findOneBy(where: FindOptionsWhere<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).findOneBy(where)
    }

    findOneById(id: TEntity['id'], manager?: EntityManager) {
        return this.getRepository(manager).findOne({
            where: {
                id
            } as FindOptionsWhere<TEntity>
        })
    }

    count(options?: FindManyOptions<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).count(options)
    }

    countBy(where: FindOptionsWhere<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).countBy(where)
    }

    async exists(where: FindOptionsWhere<TEntity>, manager?: EntityManager) {
        const total = await this.countBy(where, manager)

        return total > 0
    }

    create(data: DeepPartial<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).create(data)
    }

    save(data: DeepPartial<TEntity>, manager?: EntityManager) {
        return this.getRepository(manager).save(data)
    }

    async createAndSave(data: DeepPartial<TEntity>, manager?: EntityManager) {
        const repository = this.getRepository(manager)
        const entity = repository.create(data)

        return repository.save(entity)
    }

    async createBatch(data: DeepPartial<TEntity>[], options: CreateBatchOptions = {}, manager?: EntityManager): Promise<CreateBatchResult<TEntity>> {
        const chunkSize = this.normalizeChunkSize(options.chunkSize)
        const result: CreateBatchResult<TEntity> = {
            totalRecord: data.length,
            totalAdded: 0,
            failed: []
        }

        for (let index = 0; index < data.length; index += chunkSize) {
            const chunk = data.slice(index, index + chunkSize)

            try {
                const saved = await this.saveBatch(chunk, manager)
                result.totalAdded += saved.length
            } catch {
                await this.saveBatchOneByOne(chunk, result, manager)
            }
        }

        return result
    }

    async update(where: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[], data: DeepPartial<TEntity>, manager?: EntityManager) {
        const repository = this.getRepository(manager)

        if (!data.updatedAt)
            (data as any).updatedAt = new Date()

        return repository.update(where, data)
    }

    updateById(
        id: TEntity['id'],
        data: DeepPartial<TEntity>,
        manager?: EntityManager
    ) {
        const repository = this.getRepository(manager)

        if (!data.updatedAt)
            (data as any).updatedAt = new Date()

        return repository.update(id, data)
    }

    async updateByIds(
        ids: string[],
        data: QueryDeepPartialEntity<TEntity>,
        manager?: EntityManager
    ) {
        const repository = this.getRepository(manager)

        if (!(data as any).updatedAt)
            (data as any).updatedAt = new Date()

        return repository.update(ids, { ...data })
    }

    async removeById(id: TEntity['id'], manager?: EntityManager) {
        const repository = this.getRepository(manager)

        const entity = await this.findOneById(id, manager)

        if (!entity) {
            return null
        }

        await repository.remove(entity)

        return entity
    }

    async softRemoveById(id: TEntity['id'], manager?: EntityManager) {
        const repository = this.getRepository(manager)

        const entity = await this.findOneById(id, manager)

        if (!entity) {
            return null
        }

        await repository.softRemove(entity)

        return entity
    }

    async restoreById(id: TEntity['id'], manager?: EntityManager) {
        const result = await this.getRepository(manager).restore(id)

        return Boolean(result.affected)
    }

    async delete(where: FindOptionsWhere<TEntity>, manager?: EntityManager) {
        const result = await this.getRepository(manager).delete(where)

        return Boolean(result.affected)
    }

    private normalizeChunkSize(chunkSize?: number) {
        if (!chunkSize || chunkSize < 1) return BaseModel.defaultChunkSize

        return Math.floor(chunkSize)
    }

    async saveBatch(data: DeepPartial<TEntity>[], manager?: EntityManager) {
        const repo = this.getRepository(manager)
        const objects = repo.create(data)

        return repo.save(objects, {
            chunk: data.length
        })
    }

    private async saveBatchOneByOne(data: DeepPartial<TEntity>[], result: CreateBatchResult<TEntity>, manager?: EntityManager) {
        for (const item of data) {
            try {
                await this.saveBatch([item], manager)
                result.totalAdded += 1
            } catch (error) {
                result.failed.push({
                    data: item,
                    error
                })
            }
        }
    }
}
