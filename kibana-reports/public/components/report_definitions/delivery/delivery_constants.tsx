/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

export const EMAIL_RECIPIENT_OPTIONS = [
  // TODO: remove once we support actual kibana users
  { label: 'admin (self)' },
  { label: 'davidcui' },
  { label: 'szhongna' },
  { label: 'jadhanir' },
  { label: 'kvngar' },
];

export const EMAIL_FORMAT_OPTIONS = [
  {
    id: 'Embedded HTML',
    label: 'Embedded HTML report',
  },
  {
    id: 'Attachment',
    label: 'Email with report as attached file',
  },
];

export const DELIVERY_TYPE_OPTIONS = [
  {
    id: 'Kibana user',
    label: 'Kibana user',
  },
  {
    id: 'Channel',
    label: 'Email',
  },
];