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

import React, { useEffect, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiTitle,
  EuiPageBody,
  EuiSpacer,
} from '@elastic/eui';
import { ReportSettings } from '../report_settings';
import { ReportDelivery } from '../delivery';
import { ReportTrigger } from '../report_trigger';
import { generateReport } from '../../main/main_utils';

export const TIMEZONE_OPTIONS = [
  { value: -4, text: 'EDT -04:00' },
  { value: -5, text: 'CDT -05:00' },
  { value: -6, text: 'MDT -06:00' },
  { value: -7, text: 'MST/PDT -07:00' },
  { value: -8, text: 'AKDT -08:00' },
  { value: -10, text: 'HST -10:00' },
];

export let defaultUrl;
interface reportParamsType {
  report_name: string;
  report_source: string;
  description: string;
  core_params: visualReportParams | dataReportParams;
}
interface visualReportParams {
  base_url: string;
  report_format: string;
  time_duration: string;
}

interface dataReportParams {
  saved_search_id: number;
  base_url: string;
  report_format: string;
  time_duration: string;
}
interface triggerType {
  trigger_type: string;
  trigger_params?: {};
}

export interface reportDefinitionParams {
  report_params: reportParamsType;
  delivery?: any;
  trigger: triggerType;
}

export interface timeRangeParams {
  timeFrom: any;
  timeTo: any;
}

export function CreateReport(props) {
  let createReportDefinitionRequest: reportDefinitionParams = {
    report_params: {
      report_name: '',
      report_source: '',
      description: '',
      core_params: {
        base_url: '',
        report_format: '',
        //TODO: remove hard code
        time_duration: '5m',
      },
    },
    //TODO: temporarily comment out "delivery" field
    // delivery: {},
    trigger: {
      trigger_type: '',
    },
  };

  let timeRange = {
    timeFrom: new Date(),
    timeTo: new Date(),
  };

  const createNewReportDefinition = async (metadata, timeRange) => {
    console.log(metadata);
    const { httpClient } = props;
    httpClient
      .post('../api/reporting/reportDefinition', {
        body: JSON.stringify(metadata),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then(async (resp) => {
        if (metadata.trigger.trigger_type === 'On demand') {
          let onDemandDownloadMetadata = {
            query_url: `${
              metadata.report_params.core_params.base_url
            }?_g=(time:(from:'${timeRange.timeFrom.toISOString()}',to:'${timeRange.timeTo.toISOString()}'))`,
            time_from: timeRange.timeFrom.valueOf(),
            time_to: timeRange.timeTo.valueOf(),
            report_definition: metadata,
          };
          //TODO: for testing purpose, remove later
          console.log(onDemandDownloadMetadata);
          generateReport(onDemandDownloadMetadata, httpClient);
        }
        window.location.assign(`opendistro_kibana_reports#/`);
      })
      .catch((error) => {
        console.log('error in creating report definition:', error);
      });
  };

  useEffect(() => {
    props.setBreadcrumbs([
      {
        text: 'Reporting',
        href: '#',
      },
      {
        text: 'Create report definition',
        href: '#/create',
      },
    ]);
  }, []);

  return (
    <div>
      <EuiPageBody>
        <EuiTitle>
          <h1>Create report definition</h1>
        </EuiTitle>
        <EuiSpacer />
        <ReportSettings
          edit={false}
          reportDefinitionRequest={createReportDefinitionRequest}
          httpClientProps={props['httpClient']}
          timeRange={timeRange}
        />
        <EuiSpacer />
        <ReportTrigger
          edit={false}
          reportDefinitionRequest={createReportDefinitionRequest}
        />
        <EuiSpacer />
        {/* <ReportDelivery
          edit={false}
          reportDefinitionRequest={createReportDefinitionRequest}
        /> */}
        <EuiSpacer />
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={() => {
                window.location.assign('opendistro_kibana_reports#/');
              }}
            >
              Cancel
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill={true}
              onClick={() =>
                createNewReportDefinition(
                  createReportDefinitionRequest,
                  timeRange
                )
              }
            >
              Create
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageBody>
    </div>
  );
}
