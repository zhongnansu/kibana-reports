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

  let reportHeader = header
    ? DOMPurify.sanitize(header)
    : DEFAULT_REPORT_HEADER;
  let reportFooter = footer ? DOMPurify.sanitize(footer) : '';

  reportHeader = composeTemplateHtml(reportHeader, 'header');
  reportFooter = composeTemplateHtml(reportFooter, 'footer');

  // set up puppeteer
  const browser = await puppeteer.launch({
    headless: false,
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
      // element = await page.$(SELECTOR.dashboard);
      // selector = SELECTOR.dashboard;
      break;

    case REPORT_TYPE.visualization:
      await page.waitForSelector(SELECTOR.visualization, { visible: true });
      // element = await page.$(SELECTOR.visualization);
      // selector = SELECTOR.visualization;
      break;

    default:
      throw Error(
        `report source for visual report can only be one of [Dashboard, Visualization]`
      );
  }

  // remove top nav bar
  await page.evaluate(
    /* istanbul ignore next */
    (header, footer, selector, styleSheet) => {
      // remove buttons, top navbar, padding top
      document.querySelector('.headerGlobalNav')?.remove();
      document
        .querySelectorAll("[class^='euiButton']")
        .forEach((e) => e.remove());

      document.querySelector(
        '.coreSystemRootDomElement.euiBody--headerIsFixed'
      ).style.paddingTop = '0px';

      let headerDiv = document.createElement('div');
      headerDiv.innerHTML = header;
      let footerDiv = document.createElement('div');
      footerDiv.innerHTML = footer;
      // reportWrapperDiv.setAttribute('class', 'reportWrapper');

      // const reportingHeaderDiv = document.createElement('div');
      // reportingHeaderDiv.setAttribute('id', 'reportingHeader');

      // reportWrapperDiv.append(reportingHeaderDiv);

      // reportingHeaderDiv.innerHTML = header;

      // const htmlToElement = (html: string) => {
      //   let headerDiv = document.createElement('div');
      //   headerDiv.setAttribute('id', 'reportingHeader');
      //   headerDiv.innerHTML = html;
      //   return headerDiv.content.childNodes;
      // };

      // const nodeList = htmlToElement(header);
      // if (nodeList) {
      //   let size = nodeList.length;
      //   for (let i = size; i >= 0; i--) {
      //     document.querySelector(selector)?.prepend(nodeList[i]);
      //   }
      // }

      // document.querySelector('#kibana-body')?.prepend(reportWrapperDiv);
      document.querySelector('.content')?.prepend(headerDiv);
      document.querySelector('.content')?.append(footerDiv);
      // add style sheet
      const style = document.createElement('style');
      style.textContent = styleSheet;
      document.head.prepend(style);
    },
    reportHeader,
    reportFooter,
    selector,
    styleSheet
  );

  const html = await page.content();
  fs.writeFileSync('test.html', html);

  /**
   *  TODO: there are some issues to fix
   *  1. visualization header footer are not rendered correctly
   *  2. footer is not rendered, you can still see the footer actually being added to the test.html above
   */

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
  // await browser.close();

  return { timeCreated, dataUrl: buffer.toString('base64'), fileName };
};

export const styleSheet = `
.mde-preview .mde-preview-content {
  padding: 10px; }
  .mde-preview .mde-preview-content p, .mde-preview .mde-preview-content blockquote, .mde-preview .mde-preview-content ul, .mde-preview .mde-preview-content ol, .mde-preview .mde-preview-content dl, .mde-preview .mde-preview-content table, .mde-preview .mde-preview-content pre {
    margin-top: 0;
    margin-bottom: 16px; }
  .mde-preview .mde-preview-content h1, .mde-preview .mde-preview-content h2, .mde-preview .mde-preview-content h3 {
    margin-top: 24px;
    margin-bottom: 16px;
    font-weight: 600;
    line-height: 1.25;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.3em; }
  .mde-preview .mde-preview-content h1 {
    font-size: 1.6em; }
  .mde-preview .mde-preview-content h2 {
    font-size: 1.4em; }
  .mde-preview .mde-preview-content h3 {
    font-size: 1.2em; }
  .mde-preview .mde-preview-content ul, .mde-preview .mde-preview-content ol {
    padding-left: 2em; }
  .mde-preview .mde-preview-content blockquote {
    margin-left: 0;
    padding: 0 1em;
    color: #777;
    border-left: 0.25em solid #ddd; }
    .mde-preview .mde-preview-content blockquote > :first-child {
      margin-top: 0; }
    .mde-preview .mde-preview-content blockquote > :last-child {
      margin-bottom: 0; }
  .mde-preview .mde-preview-content code {
    padding: 0.2em 0 0.2em 0;
    margin: 0;
    font-size: 90%;
    background-color: rgba(0, 0, 0, 0.04);
    border-radius: 3px; }
    .mde-preview .mde-preview-content code::before, .mde-preview .mde-preview-content code::after {
      letter-spacing: -0.2em;
      content: "\\00a0"; }
  .mde-preview .mde-preview-content pre {
    padding: 16px;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    background-color: #f7f7f7;
    border-radius: 3px; }
    .mde-preview .mde-preview-content pre code {
      display: inline;
      padding: 0;
      margin: 0;
      overflow: visible;
      line-height: inherit;
      word-wrap: normal;
      background-color: transparent;
      border: 0; }
      .mde-preview .mde-preview-content pre code::before, .mde-preview .mde-preview-content pre code::after {
        content: none; }
    .mde-preview .mde-preview-content pre > code {
      padding: 0;
      margin: 0;
      font-size: 100%;
      word-break: normal;
      white-space: pre;
      background: transparent;
      border: 0; }
  .mde-preview .mde-preview-content a {
    color: #4078c0;
    text-decoration: none; }
    .mde-preview .mde-preview-content a:hover {
      text-decoration: underline; }
  .mde-preview .mde-preview-content > *:first-child {
    margin-top: 0 !important; }
  .mde-preview .mde-preview-content > *:last-child {
    margin-bottom: 0 !important; }
  .mde-preview .mde-preview-content::after {
    display: table;
    clear: both;
    content: ""; }
  .mde-preview .mde-preview-content table {
    display: block;
    width: 100%;
    border-spacing: 0;
    border-collapse: collapse; }
    .mde-preview .mde-preview-content table thead th {
      font-weight: bold; }
    .mde-preview .mde-preview-content table th, .mde-preview .mde-preview-content table td {
      padding: 6px 13px;
      border: 1px solid #c8ccd0; }

html,
body {
  margin: 0;
  padding: 0;
}

/*  nice padding + matches Kibana default UI colors you could also set this to inherit if 
      the wrapper gets inserted inside a kibana section. I might also remove the manual text color here as well, potentially */
.reportWrapper {
  padding: 1em;
  background-color: #fafbfd;
}

/* Notice that I'm using an ID of #reportingHeader, and #reportingFooter, instead of a classname (.reportingHeader, .reportingFooter). This is
  in order to force specificity here higher in case any other styles would conflict */
#reportingHeader,
#reportingFooter {
  font-family: 'Inter UI', -apple-system, BlinkMacSystemFont, 'Segoe UI',
    Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
    'Segoe UI Symbol';
  background-color: #fff;
  border: 1px solid #d3dae6;
  box-shadow: 0 2px 2px -1px rgba(152, 162, 179, 0.3),
    0 1px 5px -2px rgba(152, 162, 179, 0.3);
  border-radius: 4px;
  padding: 1em;
  margin-bottom: 1em;
}

#reportingFooter {
  margin-top: 1em;
}

#reportingHeader p,
#reportingFooter p {
  max-width: 960px;
}

/* Because we don't know the exact heading level the markdown might give us, we're flattening them */


/* Adjust the margin when the header is the first item */
#reportingHeader h1:first-child,
#reportingFooter h1:first-child,
#reportingHeader h2:first-child,
#reportingFooter h2:first-child,
#reportingHeader h3:first-child,
#reportingFooter h3:first-child,
#reportingHeader h4:first-child,
#reportingFooter h4:first-child,
#reportingHeader h5:first-child,
#reportingFooter h5:first-child,
#reportingHeader h6:first-child,
#reportingFooter h6:first-child {
  margin-top: 0.25em;
}

/* nicer list styles */
#reportingHeader ul,
#reportingFooter ul,
#reportingHeader ol,
#reportingFooter ol {
  max-width: 70rem;
  margin-bottom: 1em;
}

#reportingHeader ul li,
#reportingFooter ul li,
#reportingHeader ol li,
#reportingFooter ol li {
  margin-bottom: 0.25em;
  margin-left: -0.5em;
  padding-left: 0.25em;
}

#reportingHeader ul,
#reportingFooter ul {
  list-style-type: disc;
}

/* here we explicitly set nested paragraphs inside lists to inherit their styles from the list, in case markdown does funky things */
#reportingHeader ul p,
#reportingFooter ul p,
#reportingHeader ol p,
#reportingFooter ol p {
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  /* We only inherit vertical spacing, not horizontal */
  margin-top: inherit;
  margin-bottom: inherit;
}
`;

export const composeTemplateHtml = (
  headerOrFooterHtml: string,
  type: string
) => {
  const id = type === 'header' ? 'reportingHeader' : 'reportingFooter';
  const templateHtml = `<div class="reportWrapper">
<div id=${id}>
    <div class="mde-preview" style="min-height: 210px;" data-testid="mde-preview">
        <div class="mde-preview-content">${headerOrFooterHtml}</div></div></div></div>`;
  return templateHtml;
};
