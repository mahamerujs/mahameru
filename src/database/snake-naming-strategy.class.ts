import { DefaultNamingStrategy, Table, type NamingStrategyInterface } from "typeorm"
import { snakeCase } from "typeorm/util/StringUtils.js"

export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
    tableName(className: string, customName: string | undefined): string {
        return customName ?? snakeCase(className)
    }

    columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
        const name = customName ?? propertyName

        return snakeCase([...embeddedPrefixes, name].join('_'))
    }

    relationName(propertyName: string): string {
        return snakeCase(propertyName)
    }

    joinColumnName(relationName: string, referencedColumnName: string): string {
        return snakeCase(`${relationName}_${referencedColumnName}`)
    }

    joinTableName(
        firstTableName: string,
        secondTableName: string,
        _firstPropertyName: string,
        _secondPropertyName: string
    ): string {
        return snakeCase(`${firstTableName}_${secondTableName}`)
    }

    joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
        return snakeCase(`${tableName}_${columnName ?? propertyName}`)
    }

    joinTableInverseColumnName(tableName: string, propertyName: string, columnName?: string): string {
        return snakeCase(`${tableName}_${columnName ?? propertyName}`)
    }

    foreignKeyName(
        tableOrName: Table | string,
        _columnNames: string[],
        referencedTablePath?: string,
        _referencedColumnNames?: string[]
    ): string {
        const tableName = this.getTableName(tableOrName)
        const referencedTableName = referencedTablePath?.split('.').pop()

        return snakeCase(`fk_${tableName}__${referencedTableName}`)
    }

    uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
        const tableName = this.getTableName(tableOrName)
        const columns = columnNames.map((columnName) => snakeCase(columnName)).join('__')

        return `uq_${tableName}__${columns}`
    }

    indexName(tableOrName: Table | string, columnNames: string[], where?: string): string {
        const tableName = this.getTableName(tableOrName)
        const columns = columnNames.map((columnName) => snakeCase(columnName)).join('__')
        const suffix = where ? `__${snakeCase(where)}` : ''

        return `idx_${tableName}__${columns}${suffix}`
    }
}
