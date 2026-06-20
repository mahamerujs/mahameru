import type { FindManyOptions } from 'typeorm'
import type { Request } from "express"
import type { BaseEntity } from "./base.entity.js"

type BaseControllerOptions<T> = {
    defaultLimit?: number
    maxLimit?: number
    defaultOffset?: number
    defaultSortBy?: keyof T
    defaultSortDirection?: 'ASC' | 'DESC'
    allowedSortFields?: (keyof T)[]
}

export type SortDirection = "ASC" | "DESC"

export type ParsedListQuery<T> = {
    query: string | undefined;
    limit: number;
    offset: number;
    sortBy: keyof T | keyof BaseEntity;
    sortDirection: SortDirection
}

export class BaseController<T> {
    private defaultLimit = 10
    private maxLimit = 100
    private defaultOffset = 0
    private defaultSortBy: keyof T | keyof BaseEntity = 'createdAt'
    private defaultSortDirection: 'ASC' | 'DESC' = 'ASC'
    private allowedSortFields: (keyof T)[] = []

    constructor(options?: BaseControllerOptions<T>) {
        if (options) {
            if (options.defaultLimit !== undefined) {
                this.defaultLimit = options.defaultLimit
            }

            if (options.maxLimit !== undefined) {
                this.maxLimit = options.maxLimit
            }

            if (options.defaultOffset !== undefined) {
                this.defaultOffset = options.defaultOffset
            }

            if (options.defaultSortBy !== undefined) {
                this.defaultSortBy = options.defaultSortBy
            }

            if (options.defaultSortDirection !== undefined) {
                this.defaultSortDirection = options.defaultSortDirection
            }

            if (options.allowedSortFields !== undefined) {
                this.allowedSortFields = [...new Set(options.allowedSortFields)]
            }
        }
    }

    parseListQuery = (request: Request): ParsedListQuery<T> => {
        const { query: rawQuery, limit: rawLimit, offset: rawOffset, sortBy: rawSortBy, sortDirection: rawSortDirection } = request.query

        return {
            query: this.parseQuery(rawQuery),
            limit: this.parseLimit(rawLimit),
            offset: this.parseOffset(rawOffset),
            sortBy: this.parseSortBy(rawSortBy),
            sortDirection: this.parseSortDirection(rawSortDirection)
        }
    }

    //@ts-ignore
    private parseTypeORMFindManyOptions(rawQuery: unknown): FindManyOptions<T> | undefined {
        try {
            if (typeof rawQuery === 'string' && rawQuery.trim().length > 0) {
                const result = JSON.parse(rawQuery)

                if (
                    "where" in result && typeof result.where === 'object' && result.where !== null ||
                    "relations" in result && typeof result.relations === 'object' && result.relations !== null ||
                    "order" in result && typeof result.order === 'object' ||
                    "select" in result && typeof result.select === 'object' ||
                    "take" in result ||
                    "skip" in result
                ) {
                    if ("take" in result)
                        result.take = parseInt(result.take)

                    if ("skip" in result)
                        result.skip = parseInt(result.skip)

                    return result as FindManyOptions<T>
                }
            }
        } catch {
            return undefined
        }

        return undefined
    }

    private parseQuery(rawQuery: unknown): string | undefined {
        if (Array.isArray(rawQuery)) {
            rawQuery = rawQuery[0]
        }

        if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
            return undefined
        }

        return rawQuery
    }

    private parseLimit(rawLimit: unknown): number {
        const parsed = this.parseInteger(rawLimit)

        if (parsed === null || parsed < 1) {
            return this.defaultLimit
        }

        return Math.min(parsed, this.maxLimit)
    }

    private parseOffset(rawOffset: unknown): number {
        const parsed = this.parseInteger(rawOffset)

        if (parsed === null || parsed < 0) {
            return this.defaultOffset
        }

        return parsed
    }

    private parseSortBy(rawSortBy: unknown): keyof T | keyof BaseEntity {
        if (Array.isArray(rawSortBy)) {
            rawSortBy = rawSortBy[0]
        }

        if (typeof rawSortBy !== 'string') {
            return this.defaultSortBy
        }

        if (!this.allowedSortFields.includes(rawSortBy as keyof T)) {
            return this.defaultSortBy
        }

        return rawSortBy as keyof T
    }

    private parseSortDirection(rawSortDirection: unknown): 'ASC' | 'DESC' {
        if (Array.isArray(rawSortDirection)) {
            rawSortDirection = rawSortDirection[0]
        }

        if (typeof rawSortDirection !== 'string') {
            return this.defaultSortDirection
        }

        return rawSortDirection.toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    }

    private parseInteger(value: unknown): number | null {
        if (Array.isArray(value)) {
            value = value[0]
        }

        if (typeof value !== 'string' || value.trim().length === 0) {
            return null
        }

        const numberValue = Number(value)

        if (!Number.isFinite(numberValue)) {
            return null
        }

        return Math.floor(numberValue)
    }
}
