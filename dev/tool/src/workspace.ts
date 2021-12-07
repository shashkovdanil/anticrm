//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021 Hardcore Engineering Inc.
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

import contact from '@anticrm/contact'
import core, { DOMAIN_TX, Tx } from '@anticrm/core'
import builder, { migrateOperations } from '@anticrm/model-all'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { BucketItem, Client, ItemBucketMetadata } from 'minio'
import { Document, MongoClient } from 'mongodb'
import { join } from 'path'
import { connect } from './connect'
import { MigrateClientImpl } from './upgrade'

const txes = JSON.parse(JSON.stringify(builder.getTxes())) as Tx[]

/**
 * @public
 */
export async function initWorkspace (mongoUrl: string, dbName: string, transactorUrl: string, minio: Client): Promise<void> {
  const client = new MongoClient(mongoUrl)
  try {
    await client.connect()
    const db = client.db(dbName)

    console.log('dropping database...')
    await db.dropDatabase()

    console.log('creating model...')
    const model = txes.filter((tx) => tx.objectSpace === core.space.Model)
    const result = await db.collection(DOMAIN_TX).insertMany(model as Document[])
    console.log(`${result.insertedCount} model transactions inserted.`)

    console.log('creating data...')
    const data = txes.filter((tx) => tx.objectSpace !== core.space.Model)

    const connection = await connect(transactorUrl, dbName)
    for (const tx of data) {
      await connection.tx(tx)
    }
    await connection.close()

    console.log('create minio bucket')
    if (!(await minio.bucketExists(dbName))) {
      await minio.makeBucket(dbName, 'k8s')
    }
  } finally {
    await client.close()
  }
}

/**
 * @public
 */
export async function upgradeWorkspace (
  mongoUrl: string,
  dbName: string,
  transactorUrl: string,
  minio: Client
): Promise<void> {
  const client = new MongoClient(mongoUrl)
  try {
    await client.connect()
    const db = client.db(dbName)

    console.log('removing model...')
    // we're preserving accounts (created by core.account.System).
    const result = await db.collection(DOMAIN_TX).deleteMany({
      objectSpace: core.space.Model,
      modifiedBy: core.account.System,
      objectClass: { $ne: contact.class.EmployeeAccount }
    })
    console.log(`${result.deletedCount} transactions deleted.`)

    console.log('creating model...')
    const model = txes.filter((tx) => tx.objectSpace === core.space.Model)
    const insert = await db.collection(DOMAIN_TX).insertMany(model as Document[])
    console.log(`${insert.insertedCount} model transactions inserted.`)

    const migrateClient = new MigrateClientImpl(db)
    for (const op of migrateOperations) {
      await op.migrate(migrateClient)
    }

    console.log('Apply upgrade operations')

    const connection = await connect(transactorUrl, dbName)
    for (const op of migrateOperations) {
      await op.upgrade(connection)
    }

    await connection.close()
  } finally {
    await client.close()
  }
}

interface CollectionInfo {
  name: string
  file: string
}

type MinioWorkspaceItem = BucketItem & { metaData: ItemBucketMetadata }

interface WorkspaceInfo {
  version: string
  collections: CollectionInfo[]
  minioData: MinioWorkspaceItem[]
}

/**
 * @public
 */
export async function dumpWorkspace (mongoUrl: string, dbName: string, fileName: string, minio: Client): Promise<void> {
  const client = new MongoClient(mongoUrl)
  try {
    await client.connect()
    const db = client.db(dbName)

    console.log('dumping transactions...')

    if (!existsSync(fileName)) {
      await mkdir(fileName, { recursive: true })
    }

    const workspaceInfo: WorkspaceInfo = {
      version: '0.6.0',
      collections: [],
      minioData: []
    }
    const collections = await db.collections()
    for (const c of collections) {
      const docs = await c.find().toArray()
      workspaceInfo.collections.push({ name: c.collectionName, file: c.collectionName + '.json' })
      await writeFile(fileName + c.collectionName + '.json', JSON.stringify(docs, undefined, 2))
    }

    console.log('Dump minio objects')
    if (await minio.bucketExists(dbName)) {
      workspaceInfo.minioData.push(...(await listMinioObjects(minio, dbName)))
      const minioDbLocation = fileName + '.minio'
      if (!existsSync(minioDbLocation)) {
        await mkdir(minioDbLocation)
      }
      for (const d of workspaceInfo.minioData) {
        const stat = await minio.statObject(dbName, d.name)
        const data = await minio.getObject(dbName, d.name)
        const allData = []
        d.metaData = stat.metaData
        let chunk
        while ((chunk = data.read()) !== null) {
          allData.push(chunk)
        }
        await writeFile(join(minioDbLocation, d.name), allData.join(''))
      }
    }

    await writeFile(fileName + '.workspace.json', JSON.stringify(workspaceInfo, undefined, 2))
  } finally {
    await client.close()
  }
}

async function listMinioObjects (minio: Client, dbName: string): Promise<MinioWorkspaceItem[]> {
  const items: MinioWorkspaceItem[] = []
  const list = await minio.listObjects(dbName, undefined, true)
  await new Promise((resolve) => {
    list.on('data', (data) => {
      items.push({ ...data, metaData: {} })
    })
    list.on('end', () => {
      resolve(null)
    })
  })
  return items
}

export async function restoreWorkspace (mongoUrl: string, dbName: string, fileName: string, minio: Client): Promise<void> {
  const client = new MongoClient(mongoUrl)
  try {
    await client.connect()
    const db = client.db(dbName)

    console.log('dumping transactions...')

    const workspaceInfo = JSON.parse((await readFile(fileName + '.workspace.json')).toString()) as WorkspaceInfo

    // Drop existing collections

    const cols = await db.collections()
    for (const c of cols) {
      await db.dropCollection(c.collectionName)
    }
    // Restore collections.
    for (const c of workspaceInfo.collections) {
      const collection = db.collection(c.name)
      await collection.deleteMany({})
      const data = JSON.parse((await readFile(fileName + c.name + '.json')).toString()) as Document[]
      await collection.insertMany(data)
    }

    console.log('Restore minio objects')
    if (await minio.bucketExists(dbName)) {
      const objectNames = (await listMinioObjects(minio, dbName)).map(i => i.name)
      await minio.removeObjects(dbName, objectNames)
      await minio.removeBucket(dbName)
    }
    await minio.makeBucket(dbName, 'k8s')

    const minioDbLocation = fileName + '.minio'
    for (const d of workspaceInfo.minioData) {
      const data = await readFile(join(minioDbLocation, d.name))
      await minio.putObject(dbName, d.name, data, d.size, d.metaData)
    }
  } finally {
    await client.close()
  }
}
