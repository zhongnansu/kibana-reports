package com.amazon.opendistroforelasticsearch.reportsscheduler.rest.handler;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.elasticsearch.client.node.NodeClient;
import org.elasticsearch.rest.BytesRestResponse;
import org.elasticsearch.rest.RestChannel;

import java.io.IOException;

/** Action handler to process REST request and handle failures. */
public abstract class AbstractActionHandler {
  protected final NodeClient client;
  protected final RestChannel channel;
  private final Logger logger = LogManager.getLogger(AbstractActionHandler.class);

  /**
   * Constructor function.
   *
   * @param client ES node client that executes actions on the local node
   * @param channel ES channel used to construct bytes / builder based outputs, and send responses
   */
  public AbstractActionHandler(NodeClient client, RestChannel channel) {
    this.client = client;
    this.channel = channel;
  }

  /**
   * Send failure message via channel.
   *
   * @param e exception
   */
  public void onFailure(Exception e) {
    if (e != null) {
      try {
        channel.sendResponse(new BytesRestResponse(channel, e));
      } catch (IOException e1) {
        logger.warn("Fail to send out failure message of exception", e);
      }
    }
  }
}
