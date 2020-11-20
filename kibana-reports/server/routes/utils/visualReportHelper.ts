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

import puppeteer, { ElementHandle, SetCookie } from 'puppeteer';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Logger } from '../../../../../src/core/server';
import {
  DEFAULT_REPORT_HEADER,
  REPORT_TYPE,
  FORMAT,
  SELECTOR,
} from './constants';
import { getFileName } from './helpers';
import { CreateReportResultType } from './types';
import { ReportParamsSchemaType, VisualReportSchemaType } from 'server/model';
import fs from 'fs';

export const createVisualReport = async (
  reportParams: ReportParamsSchemaType,
  queryUrl: string,
  logger: Logger,
  cookie?: SetCookie
): Promise<CreateReportResultType> => {
  const {
    core_params,
    report_name: reportName,
    report_source: reportSource,
  } = reportParams;
  const coreParams = core_params as VisualReportSchemaType;
  const {
    header,
    footer,
    window_height: windowHeight,
    window_width: windowWidth,
    report_format: reportFormat,
  } = coreParams;

  // TODO: polish default header, maybe add a logo, depends on UX design
  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);

  const reportHeader = header
    ? DOMPurify.sanitize(header)
    : DEFAULT_REPORT_HEADER;
  const reportFooter = footer ? DOMPurify.sanitize(footer) : '';

  // set up puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    /**
     * TODO: temp fix to disable sandbox when launching chromium on Linux instance
     * https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
     */
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(60000); // use 60s timeout instead of default 30s
  if (cookie) {
    logger.info('domain enables security, use session cookie to access');
    await page.setCookie(cookie);
  }
  logger.info(`original queryUrl ${queryUrl}`);
  await page.goto(queryUrl, { waitUntil: 'networkidle0' });
  logger.info(`page url ${page.url()}`);

  await page.setViewport({
    width: windowWidth,
    height: windowHeight,
  });

  let buffer: Buffer | undefined;
  let element: ElementHandle<Element> | null;
  let selector: any;

  // crop content
  switch (reportSource) {
    case REPORT_TYPE.dashboard:
      await page.waitForSelector(SELECTOR.dashboard, { visible: true });
      element = await page.$(SELECTOR.dashboard);
      selector = SELECTOR.dashboard;
      break;

    case REPORT_TYPE.visualization:
      await page.waitForSelector(SELECTOR.visualization, { visible: true });
      element = await page.$(SELECTOR.visualization);
      selector = SELECTOR.visualization;
      break;

    default:
      throw Error(
        `report source for visual report can only be one of [Dashboard, Visualization]`
      );
  }

  console.log(reportHeader);

  // remove top nav bar
  await page.evaluate(
    /* istanbul ignore next */
    (header, footer, selector) => {
      document.querySelector('.headerGlobalNav')?.remove();
      document.querySelector('.globalQueryBar')?.remove();
      document.querySelector('.visEditor__content')?.remove();
      document.querySelector(
        '.coreSystemRootDomElement.euiBody--headerIsFixed'
      ).style.paddingTop = '0px';

      const htmlToElement = (html: string) => {
        let template = document.createElement('template');
        template.setAttribute('font-size', '800px');
        template.innerHTML = html;
        return template.content.childNodes;
      };

      const nodeList = htmlToElement(header);
      if (nodeList) {
        let size = nodeList.length;
        for (let i = size; i >= 0; i--) {
          document.querySelector(selector)?.prepend(nodeList[i]);
        }
      }
      // document
      //   .getElementById('dashboardViewport')
      //   ?.insertAdjacentHTML('afterbegin', header);
    },
    reportHeader,
    reportFooter,
    selector
  );

  const html = await page.content();
  fs.writeFileSync('test.html', html);

  // const screenshot = await element.screenshot({ fullPage: false });

  /**
   * Sets the content of the page to have the header be above the trimmed screenshot
   * and the footer be below it
   */
  // TODO: make all html templates into files, such as reporting context menu button, and embedded html of email body
  const page2 = browser.newPage();
  await (await page2).setContent();
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: "Inter UI", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
            font-kerning: normal;
          }
        </style>
      </head>
      <body>
        <div>
        ${reportHeader}
          <img src="data:image/png;base64,${screenshot.toString('base64')}">
        ${reportFooter}
        </div>
      </body>
    </html>
    `);

  // create pdf or png accordingly
  switch (reportFormat) {
    case FORMAT.pdf:
      const scrollHeight = await page.evaluate(
        /* istanbul ignore next */
        () => document.documentElement.scrollHeight
      );

      buffer = await page.pdf({
        margin: undefined,
        width: windowWidth,
        height: scrollHeight + 'px',
        printBackground: true,
        pageRanges: '1',
      });
      break;

    case FORMAT.png:
      buffer = await page.screenshot({
        fullPage: true,
      });
      break;

    default:
      throw Error(
        'report format for visual report can only be one of [pdf, png]'
      );
  }

  const curTime = new Date();
  const timeCreated = curTime.valueOf();
  const fileName = `${getFileName(reportName, curTime)}.${reportFormat}`;
  await browser.close();

  return { timeCreated, dataUrl: buffer.toString('base64'), fileName };
};
