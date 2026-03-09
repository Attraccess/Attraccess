import React from 'react';
import { NavigationButtons, isNavigationButtons } from './NavigationButtons';
import { DataTable, isDataTable } from './DataTable';
import { ChartBlock, isChartBlock } from './ChartBlock';
import { InfoCard, isInfoCard } from './InfoCard';
import { LinkList, isLinkList } from './LinkList';

interface JsonRenderBlockProps {
  jsonString: string;
}

export function JsonRenderBlock({ jsonString }: JsonRenderBlockProps) {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return null;
  }

  if (isNavigationButtons(data)) return <NavigationButtons data={data} />;
  if (isDataTable(data)) return <DataTable data={data} />;
  if (isChartBlock(data)) return <ChartBlock data={data} />;
  if (isInfoCard(data)) return <InfoCard data={data} />;
  if (isLinkList(data)) return <LinkList data={data} />;

  return null;
}
