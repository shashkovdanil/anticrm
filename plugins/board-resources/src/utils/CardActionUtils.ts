import { CardAction } from '@anticrm/board'
import { Client, DocumentQuery } from '@anticrm/core'
import board from '../plugin'

export const cardActionSorter = (a1: CardAction, a2: CardAction) => a1.position - a2.position

export const getCardActions = (client: Client, query?: DocumentQuery<CardAction>) => {
  return client.findAll(board.class.CardAction, query ?? {})
}