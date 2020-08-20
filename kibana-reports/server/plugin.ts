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
 * permissions and limitations./routes/downloadhe License.
 */

import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  IClusterClient,
} from '../../../src/core/server';

import reportsSchedulerPlugin from './backend/opendistro-reports-scheduler-plugin';

import {
  OpendistroKibanaReportsPluginSetup,
  OpendistroKibanaReportsPluginStart,
} from './types';
import registerRoutes from './routes';

import { generatePDF, generatePNG } from './routes/utils/reportHelper';
import axios from 'axios';
import reportDefinition from './routes/reportDefinition';
import { RequestParams } from '@elastic/elasticsearch';

export interface ReportsPluginRequestContext {
  logger: Logger;
  esClient: IClusterClient;
}
//@ts-ignore
declare module 'kibana/server' {
  interface RequestHandlerContext {
    reports_plugin: ReportsPluginRequestContext;
  }
}

export class OpendistroKibanaReportsPlugin
  implements
    Plugin<
      OpendistroKibanaReportsPluginSetup,
      OpendistroKibanaReportsPluginStart
    > {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('opendistro_kibana_reports: Setup');
    const router = core.http.createRouter();

    // TODO: create Elasticsearch client that aware of reports-scheduler API endpoints
    // Deprecated API. Switch to the new elasticsearch client as soon as https://github.com/elastic/kibana/issues/35508 done.
    const esClient: IClusterClient = core.elasticsearch.createClient(
      'reports_scheduler',
      {
        plugins: [reportsSchedulerPlugin],
      }
    );

    // Register server side APIs
    registerRoutes(router);

    // put logger into route handler context, so that we don't need to pass through parameters
    core.http.registerRouteHandlerContext(
      //@ts-ignore
      'reporting_plugin',
      (context, request) => {
        return {
          logger: this.logger,
          esClient,
        };
      }
    );

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('opendistro_kibana_reports: Started');
    // const testData = {
    //   url: 'http://www.google.com',
    //   report_name: 'test poller report',
    //   window_width: 1200,
    //   window_height: 800,
    // };

    // async function fakePNG() {
    //   console.log('before start png: ' + new Date().toISOString());
    //   const { timeCreated, dataUrl, fileName } = await generatePNG(
    //     testData.url,
    //     testData.report_name,
    //     testData.window_width,
    //     testData.window_height
    //   );
    //   console.log(timeCreated + ' ' + fileName);
    // }

    // async function callAPI() {
    //   console.log('Call generate Report at time: ' + new Date().toISOString());
    //   const input = {
    //     report_name: 'Zhongnan_daily_report/4pm',
    //     report_source: 'Dashboard',
    //     report_type: 'Download',
    //     description: 'Hi this is your dashboard',
    //     report_params: {
    //       url: 'http://www.google.com',
    //       window_width: 1300,
    //       window_height: 900,
    //       report_format: 'png',
    //     },
    //   };
    //   const url = '/api/reporting/generateReportBySchedule';
    //   let response: any = {};
    //   const report = await axios({
    //     method: 'POST',
    //     proxy: { host: '127.0.0.1', port: 5601 },
    //     url,
    //     headers: { 'kbn-xsrf': 'reporting' },
    //     data: input,
    //   }).then((res) => {
    //     response = res.data;
    //   });
    //   console.log('report file name: ' + response.filename);
    // }

    // var interval = setInterval(callAPI, 1000 * 20);

    const schedulerClient: IClusterClient = core.elasticsearch.legacy.createClient(
      'reports_scheduler',
      {
        plugins: [reportsSchedulerPlugin],
      }
    );
    async function pollJob() {
      console.log('call at time: ' + new Date().toISOString());
      try {
        const res = await schedulerClient.callAsInternalUser(
          'reports_scheduler.getJob'
        );
        // job retrieved
        if (res) {
          const reportDefId = res._source.report_definition_id;
          console.log('report def id sent from scheduler: ' + reportDefId);

          const client = core.elasticsearch.legacy.client;
          await executeScheduledJob(reportDefId, client);

          //TODO: updateJobStatus, use scheduler client
        } else {
          console.log('no available job in queue');
        }
      } catch (error) {
        console.log(error.message);
      }
    }

    var interval = setInterval(pollJob, 1000 * 15);
    return {};
  }

  public stop() {}
}

async function executeScheduledJob(defId: string, client: IClusterClient) {
  try {
    const reportDefinition = await client.callAsInternalUser('get', {
      index: 'report_definition',
      id: defId,
    });

    // parse the response to get report params
    const source = reportDefinition._source;
    const url = source.report_params.url;
    const name = source.report_name;
    const width = 1200;
    const height = 800;

    //TODO: save new report instance with state=pending, return report_id

    // create report using the params above
    // TODO: generalize generatePDF and png to generate report
    const { timeCreated, dataUrl, fileName } = await generatePNG(
      url,
      name,
      width,
      height
    );
    console.log('new report created: ' + fileName);

    //TODO: send dataurl to notification plugin for delivery

    // update the new report instance by report id
    // if success, state = created, else state = error, save state in the newReport
    const newReport = {
      ...source,
      time_created: timeCreated,
      // state: Error
    };
    console.log(newReport);
    const params: RequestParams.Index = {
      index: 'report',
      body: newReport,
    };
    await client.callAsInternalUser('index', params);
    console.log('save new report to ES');
  } catch (error) {
    //TODO:
    console.error(error);
  }
}
