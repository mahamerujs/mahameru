import { Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm'

export abstract class BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @CreateDateColumn({
        type: 'datetime',
        precision: 3,
        default: () => 'UTC_TIMESTAMP(3)',
    })
    createdAt: Date

    @Column({
        type: 'datetime',
        precision: 3,
        default: null,
        nullable: true
    })
    updatedAt: Date | null

    @Column({
        type: 'boolean',
        default: false
    })
    isDisabled: boolean
}
