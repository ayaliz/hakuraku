import { useMemo } from 'react';
import EChartsReactCore from 'echarts-for-react/lib/core';
import { BarChart, type BarSeriesOption } from 'echarts/charts';
import {
    GridComponent,
    MarkLineComponent,
    TooltipComponent,
    type GridComponentOption,
    type MarkLineComponentOption,
    type TooltipComponentOption,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { ComposeOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { Loading, number, Panel, percent } from './components';
import type { TeamDistributionResponse } from './types';

echarts.use([BarChart, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

type ChartOption = ComposeOption<
    BarSeriesOption | GridComponentOption | MarkLineComponentOption | TooltipComponentOption
>;

type Props = {
    distribution?: TeamDistributionResponse;
    distinct: boolean;
    sort: 'rate' | 'lower';
    loading: boolean;
    error?: string;
    retry: () => void;
};

type Bin = { min: number; max: number; count: number; observedMin: number; observedMax: number };

// Thirty-three equal bins put the neutral 1/3 share exactly on the boundary
// between bins 11 and 12 instead of drawing the reference line through a bar.
const BIN_COUNT = 33;
const BIN_WIDTH = 100 / BIN_COUNT;

export default function PerformanceDistribution({ distribution, distinct, sort, loading, error, retry }: Props) {
    const rankingLabel = sort === 'lower' ? '95% interval lower bound' : 'observed win rate';
    const stats = useMemo(() => {
        if (!distribution?.totalTeams || distribution.median === null || distribution.topDecile === null) return null;
        const benchmark = Math.max(distribution.averageWinRate ?? 1 / 3, 1 / 3);
        return {
            median: distribution.median,
            topDecile: distribution.topDecile,
            benchmark,
        };
    }, [distribution]);

    const bins = useMemo(() => {
        if (!stats) return [];
        const result: Bin[] = Array.from({ length: BIN_COUNT }, (_, index) => ({
            min: index * BIN_WIDTH,
            max: (index + 1) * BIN_WIDTH,
            count: 0,
            observedMin: 100,
            observedMax: 0,
        }));
        for (const source of distribution?.bins ?? []) {
            const bin = result[source.index];
            if (!bin) continue;
            bin.count = source.count;
            bin.observedMin = source.observedMin * 100;
            bin.observedMax = source.observedMax * 100;
        }
        return result;
    }, [distribution, stats]);

    const option = useMemo<ChartOption>(() => {
        if (!stats) return {};
        const averagePercent = distribution?.averageWinRate == null ? null : distribution.averageWinRate * 100;
        const neutralPercent = 100 / 3;
        const lines: { name: string; xAxis: number; lineStyle: object; label: object }[] = [];
        if (averagePercent !== null) lines.push({
            name: 'Filtered team average',
            xAxis: averagePercent,
            lineStyle: { color: '#f2bf66', width: 2 },
            label: { show: false },
        });
        if (averagePercent === null || Math.abs(averagePercent - neutralPercent) >= 1) lines.push({
            name: 'Neutral team share',
            xAxis: neutralPercent,
            lineStyle: { color: '#9aa8ba', type: 'dashed', width: 1.5 },
            label: { show: false },
        });
        return {
            animationDuration: 350,
            backgroundColor: 'transparent',
            grid: { top: 20, right: 24, bottom: 50, left: 54 },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: '#152033f2',
                borderColor: '#52647a',
                textStyle: { color: '#eef5ff' },
                formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    const bin = bins[item?.dataIndex];
                    if (!bin) return '';
                    const share = bin.count / (distribution?.totalTeams ?? 1);
                    const observed = bin.observedMin === bin.observedMax
                        ? `${bin.observedMin.toFixed(1)}%`
                        : `${bin.observedMin.toFixed(1)}–${bin.observedMax.toFixed(1)}%`;
                    return `<strong>${bin.min.toFixed(1)}–${bin.max.toFixed(1)}% lower bound</strong><br/>${number(bin.count)} teams - ${percent(share)}<br/>Observed win rate: ${observed}`;
                },
            },
            xAxis: {
                type: 'value', min: 0, max: 100, interval: 10,
                name: '95% interval lower bound', nameLocation: 'middle', nameGap: 31,
                nameTextStyle: { color: '#9fb0c6', fontSize: 11 },
                axisLabel: { color: '#aebdd0', formatter: '{value}%' },
                axisLine: { lineStyle: { color: '#526178' } },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value', minInterval: 1,
                name: 'Teams', nameTextStyle: { color: '#9fb0c6', fontSize: 11 },
                axisLabel: { color: '#aebdd0' },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#344056', type: 'dashed' } },
            },
            series: [{
                name: 'Teams', type: 'bar', barCategoryGap: '12%',
                data: bins.map(bin => ({
                    value: [(bin.min + bin.max) / 2, bin.count],
                    itemStyle: {
                        color: (bin.min + bin.max) / 200 >= stats.benchmark ? '#65c18c'
                            : distribution?.averageWinRate != null && (bin.min + bin.max) / 200 >= distribution.averageWinRate ? '#668fbd'
                                : '#4d6685',
                        borderRadius: [2, 2, 0, 0],
                    },
                })),
                markLine: { symbol: 'none', silent: true, z: 10, data: lines },
            }],
        };
    }, [bins, distribution?.totalTeams, distribution?.averageWinRate, stats]);

    return <Panel title="Team performance distribution" className="sim-performance-panel" controls={
        <span className="sim-performance-count">{distribution ? `${number(distribution.totalTeams)} matching teams` : loading ? 'Loading teams…' : 'Team count unavailable'}</span>
    }>
        {loading ? <Loading error={error} retry={retry} /> : error ? <Loading error={error} retry={retry} /> : !stats ?
            <p className="sim-empty">No evaluated teams match these requirements.</p> : <>
                <p className={`sim-performance-scope${distinct ? ' is-showcase' : ''}`}>
                    <strong>{distinct ? 'Best-per-player showcase' : 'All matching teams'}</strong>
                    {distinct
                        ? <>Each player contributes one team: their highest-ranked matching team by {rankingLabel}.</>
                        : <>Every evaluated matching team contributes once, including benched teams and earlier results. Historical teams use their last evaluation, which may have different opponents. Players with several teams may appear several times.</>}
                </p>
                {distribution?.averageWinRate != null && <p className="sim-performance-insight">Matching teams average <strong>{percent(distribution.averageWinRate)}</strong> win rate with the current filters.</p>}
                <figure className="sim-performance-figure">
                    <div className="sim-performance-legend" aria-label="Chart reference lines">
                        {distribution?.averageWinRate != null && <span><i className="sim-performance-line sim-performance-line-population" aria-hidden="true" />Filtered team average {percent(distribution.averageWinRate)}</span>}
                        {(distribution?.averageWinRate == null || Math.abs(distribution.averageWinRate - 1 / 3) >= .01) && <span><i className="sim-performance-line sim-performance-line-neutral" aria-hidden="true" />Neutral team share 33.3%</span>}
                        <span><i className="sim-performance-swatch" aria-hidden="true" />Lower bound above {percent(stats.benchmark)} benchmark</span>
                    </div>
                    <div className="sim-performance-chart" role="img" aria-label={`Histogram of ${number(distribution?.totalTeams ?? 0)} matching evaluated teams across 33 equal 95% interval lower-bound bins. Median lower bound ${percent(stats.median)}; top ten percent begin at ${percent(stats.topDecile)}.`}>
                        <EChartsReactCore echarts={echarts} option={option} opts={{ renderer: 'svg' }} style={{ height: '310px' }} />
                    </div>
                </figure>
                <dl className="sim-performance-summary" aria-label="Filtered team performance summary">
                    <div>
                        <dt title="Arithmetic mean of the matching teams’ observed win rates. Each selected team has equal weight.">Average win rate</dt>
                        <dd>{distribution?.averageWinRate == null ? 'Unavailable' : percent(distribution.averageWinRate)}</dd>
                    </div>
                    <div>
                        <dt>Median lower bound</dt>
                        <dd>{percent(stats.median)}</dd>
                    </div>
                    <div>
                        <dt>Top 10% lower bound</dt>
                        <dd>{percent(stats.topDecile)}</dd>
                    </div>
                </dl>
            </>}
    </Panel>;
}
