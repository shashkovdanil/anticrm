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

import { Class, Doc, Domain, IndexKind, Ref } from '@anticrm/core'
import { Builder, Collection, Index, Model, Prop, TypeRef, TypeString, UX } from '@anticrm/model'
import core, { TAttachedDoc, TDoc } from '@anticrm/model-core'
import view, { ObjectDDParticipant } from '@anticrm/model-view'
import { Asset, IntlString } from '@anticrm/platform'
import type { TagCategory, TagElement, TagReference } from '@anticrm/tags'
import tags from './plugin'

export { tagsOperation } from './migration'
export { tags as default }
export { TagElement, TagReference, TagCategory } from '@anticrm/tags'

export const DOMAIN_TAGS = 'tags' as Domain

@Model(tags.class.TagElement, core.class.Doc, DOMAIN_TAGS)
@UX(tags.string.TagElementLabel)
export class TTagElement extends TDoc implements TagElement {
  @Prop(TypeString(), tags.string.TitleLabel)
  @Index(IndexKind.FullText)
  title!: string

  @Prop(TypeRef(core.class.Class), tags.string.TargetClassLabel)
  targetClass!: Ref<Class<Doc>>

  @Prop(TypeString(), tags.string.DescriptionLabel)
  @Index(IndexKind.FullText)
  description!: string

  @Prop(TypeString(), tags.string.ColorLabel)
  color!: number

  @Prop(TypeRef(tags.class.TagCategory), tags.string.CategoryLabel)
  category!: Ref<TagCategory>
}

@Model(tags.class.TagReference, core.class.AttachedDoc, DOMAIN_TAGS)
@UX(tags.string.TagReferenceLabel)
export class TTagReference extends TAttachedDoc implements TagReference {
  @Prop(TypeString(), tags.string.TitleLabel)
  @Index(IndexKind.FullText)
  title!: string

  @Prop(TypeRef(tags.class.TagElement), tags.string.TagLabel)
  @Index(IndexKind.Indexed)
  tag!: Ref<TagElement>

  @Prop(TypeString(), tags.string.ColorLabel)
  color!: number
}

@Model(tags.class.TagCategory, core.class.Doc, DOMAIN_TAGS)
@UX(tags.string.TargetCategoryLabel)
export class TTagCategory extends TDoc implements TagCategory {
  @Prop(TypeString(), tags.string.AssetLabel)
  icon!: Asset

  @Prop(TypeString(), tags.string.CategoryLabel)
  label!: IntlString

  @Prop(TypeString(), tags.string.CategoryTargetClass)
  targetClass!: Ref<Class<Doc>>

  @Prop(Collection(core.class.TypeString), tags.string.CategoryTagsLabel)
  tags!: string[]

  @Prop(TypeString(), tags.string.DefaultLabel)
  default!: boolean
}

export function createModel (builder: Builder): void {
  builder.createModel(TTagElement, TTagReference, TTagCategory)

  builder.createDoc(
    core.class.Space,
    core.space.Model,
    {
      name: 'Tags',
      description: 'Space for all tags',
      private: true,
      archived: false,
      members: []
    },
    tags.space.Tags
  )

  builder.mixin(tags.class.TagReference, core.class.Class, view.mixin.AttributeEditor, {
    editor: tags.component.Tags
  })

  builder.mixin(tags.class.TagReference, core.class.Class, view.mixin.AttributePresenter, {
    presenter: tags.component.TagReferencePresenter
  })
  builder.mixin(tags.class.TagElement, core.class.Class, view.mixin.AttributePresenter, {
    presenter: tags.component.TagElementPresenter
  })
  builder.mixin<Class<Doc>, ObjectDDParticipant>(tags.class.TagElement, core.class.Class, view.mixin.ObjectDDParticipant, {
    collectDocs: tags.dd.DeleteTagElement
  })
}