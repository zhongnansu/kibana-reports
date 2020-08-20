/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

package com.amazon.opendistroforelasticsearch.reportsscheduler.rest.handler;

import static com.amazon.opendistroforelasticsearch.reportsscheduler.common.Constants.JOB_INDEX_NAME;

import java.io.IOException;
import java.util.Locale;

import org.elasticsearch.action.ActionListener;
import org.elasticsearch.action.delete.DeleteRequest;
import org.elasticsearch.action.delete.DeleteResponse;
import org.elasticsearch.action.index.IndexRequest;
import org.elasticsearch.action.index.IndexResponse;
import org.elasticsearch.client.node.NodeClient;
import org.elasticsearch.common.xcontent.XContentType;
import org.elasticsearch.common.xcontent.json.JsonXContent;
import org.elasticsearch.rest.BytesRestResponse;
import org.elasticsearch.rest.RestChannel;
import org.elasticsearch.rest.RestRequest;
import org.elasticsearch.rest.RestResponse;
import org.elasticsearch.rest.RestStatus;

public class ReportsScheduleActionHandler extends AbstractActionHandler {

  public ReportsScheduleActionHandler(NodeClient client, RestChannel channel) {
    super(client, channel);
  }

  public void createSchedule(String jobId, RestRequest request) {
    IndexRequest indexRequest =
        new IndexRequest()
            .index(JOB_INDEX_NAME)
            .id(jobId)
            .source(request.requiredContent(), XContentType.JSON);

    // index the job parameter
    client.index(
        indexRequest,
        new ActionListener<IndexResponse>() {
          @Override
          public void onResponse(IndexResponse indexResponse) {
            try {
              RestResponse restResponse =
                  new BytesRestResponse(
                      RestStatus.OK, indexResponse.toXContent(JsonXContent.contentBuilder(), null));
              channel.sendResponse(restResponse);
            } catch (IOException e) {
              channel.sendResponse(
                  new BytesRestResponse(RestStatus.INTERNAL_SERVER_ERROR, e.getMessage()));
            }
          }

          @Override
          public void onFailure(Exception e) {
            channel.sendResponse(
                new BytesRestResponse(RestStatus.INTERNAL_SERVER_ERROR, e.getMessage()));
          }
        });
  }

  public void deleteSchedule(String jobId) {
    DeleteRequest deleteRequest = new DeleteRequest().index(JOB_INDEX_NAME).id(jobId);

    client.delete(
        deleteRequest,
        new ActionListener<DeleteResponse>() {
          @Override
          public void onResponse(DeleteResponse deleteResponse) {
            channel.sendResponse(
                new BytesRestResponse(
                    RestStatus.OK, String.format(Locale.ROOT, "Job deleted. Job id: %s", jobId)));
          }

          @Override
          public void onFailure(Exception e) {
            channel.sendResponse(
                new BytesRestResponse(RestStatus.INTERNAL_SERVER_ERROR, e.getMessage()));
          }
        });
  }
}