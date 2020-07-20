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

import { schema } from '@kbn/config-schema';
import {
  IRouter,
  IKibanaResponse,
  ResponseError,
} from '../../../../src/core/server';
import { API_PREFIX } from '../../common';
import { FORMAT, REPORT_STATE } from './utils/constants';
import { RequestParams } from '@elastic/elasticsearch';
import { generatePDF, generatePNG } from './utils/reportHelper';
import { reportSchema } from '../model';
import { parseEsErrorResponse } from './utils/helpers';

export default function (router: IRouter) {
  // Download visual report
  router.post(
    {
      path: `${API_PREFIX}/generateReport`,
      validate: {
        body: schema.any(),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IKibanaResponse<any | ResponseError>> => {
      // input validation
      try {
        reportSchema.validate(request.body);
      } catch (error) {
        return response.badRequest({ body: error });
      }

      try {
        let report = request.body;
        const report_params = report.report_params;

        if (report_params.report_format === FORMAT.png) {
          const { timeCreated, stream, fileName } = await generatePNG(
            report_params.url,
            report.report_name,
            report_params.window_width,
            report_params.window_height
          );
          /**
           * TODO: temporary, need to change after we figure out the correct date modeling
           * https://github.com/elastic/kibana/blob/master/src/core/MIGRATION.md#use-scoped-services
           * from the migration plan of kibana new platform, the usage says to get access to Elasticsearch data by
           * await context.core.elasticsearch.adminClient.callAsInternalUser('ping');
           * However, that doesn't work for now
           */
          report = {
            ...report,
            time_created: timeCreated,
            state: REPORT_STATE.created,
          };

          const params: RequestParams.Index = {
            index: 'report',
            body: report,
          };
          await context.core.elasticsearch.legacy.client.callAsInternalUser(
            'index',
            params
          );

          return response.ok({
            body: stream,
            headers: {
              'content-type': 'image/png',
              'content-disposition': `attachment; filename=${fileName}.${report_params.report_format}`,
            },
          });
        } else if (report_params.report_format === FORMAT.pdf) {
          const { timeCreated, stream, fileName } = await generatePDF(
            report_params.url,
            report.report_name,
            report_params.window_width,
            report_params.windowLength
          );

          report = {
            ...report,
            time_created: timeCreated,
            state: REPORT_STATE.created,
          };

          const params: RequestParams.Index = {
            index: 'report',
            body: report,
          };
          await context.core.elasticsearch.legacy.client.callAsInternalUser(
            'index',
            params
          );

          return response.ok({
            body: stream,
            headers: {
              'content-type': 'application/pdf',
              'content-disposition': `attachment; filename=${fileName}.${report_params.report_format}`,
            },
          });
        }
      } catch (error) {
        //@ts-ignore
        context.reporting_plugin.logger.error(
          `Fail to download visual reports: ${error}`
        );

        return response.custom({
          statusCode: error.statusCode || 500,
          body: parseEsErrorResponse(error),
        });
      }
    }
  );

  // get all reports details
  router.get(
    {
      path: `${API_PREFIX}/reports`,
      validate: {
        query: schema.object({
          size: schema.string({ defaultValue: '100' }),
          sortField: schema.maybe(schema.string()),
          sortDirection: schema.maybe(schema.string()),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IKibanaResponse<any | ResponseError>> => {
      const { size, sortField, sortDirection } = request.query as {
        size?: string;
        sortField: string;
        sortDirection: string;
      };
      const sizeNumber = parseInt(size, 10);
      const params: RequestParams.Search = {
        index: 'report',
        size: sizeNumber,
        sort: `${sortField}:${sortDirection}`,
      };
      try {
        const esResp = await context.core.elasticsearch.legacy.client.callAsInternalUser(
          'search',
          params
        );
        return response.ok({
          body: {
            total: esResp.hits.total.value,
            data: esResp.hits.hits,
          },
        });
      } catch (error) {
        //@ts-ignore
        context.reporting_plugin.logger.error(
          `Fail to get reports details: ${error}`
        );
        return response.custom({
          statusCode: error.statusCode,
          body: parseEsErrorResponse(error),
        });
      }
    }
  );

  // get single report details by id
  router.get(
    {
      path: `${API_PREFIX}/reports/{reportId}`,
      validate: {
        params: schema.object({
          reportId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IKibanaResponse<any | ResponseError>> => {
      try {
        const esResp = await context.core.elasticsearch.legacy.client.callAsInternalUser(
          'get',
          {
            index: 'report',
            id: request.params.reportId,
          }
        );
        return response.ok({
          body: esResp._source,
        });
      } catch (error) {
        //@ts-ignore
        context.reporting_plugin.logger.error(
          `Fail to get single report details: ${error}`
        );
        return response.custom({
          statusCode: error.statusCode,
          body: parseEsErrorResponse(error),
        });
      }
    }
  );

  // Delete single report by id
  router.delete(
    {
      path: `${API_PREFIX}/reports/{reportId}`,
      validate: {
        params: schema.object({
          reportId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IKibanaResponse<any | ResponseError>> => {
      try {
        const esResp = await context.core.elasticsearch.legacy.client.callAsInternalUser(
          'delete',
          {
            index: 'report',
            id: request.params.reportId,
          }
        );
        return response.ok();
      } catch (error) {
        //@ts-ignore
        context.reporting_plugin.logger.error(
          `Fail to delete report: ${error}`
        );
        return response.custom({
          statusCode: error.statusCode,
          body: parseEsErrorResponse(error),
        });
      }
    }
  );
}