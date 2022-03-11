//
// Copyright © 2022 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { Doc, DOMAIN_TX, TxCUD } from '@anticrm/core'
import { MigrateOperation, MigrationClient, MigrationUpgradeClient } from '@anticrm/model'
import notification from './plugin'

export const notificationOperation: MigrateOperation = {
  async migrate (client: MigrationClient): Promise<void> {
    const txes = await client.find<TxCUD<Doc>>(DOMAIN_TX, {
      objectClass: notification.class.LastView
    })
    await Promise.all(txes.map(async (tx) => {
      await client.delete(DOMAIN_TX, tx._id)
    }))
  },
  async upgrade (client: MigrationUpgradeClient): Promise<void> {
  }
}