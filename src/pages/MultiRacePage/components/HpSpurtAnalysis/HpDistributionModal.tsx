import React, { useMemo, useRef, useEffect } from 'react';
import { Modal } from 'react-bootstrap';
import EChartsReactCore from "echarts-for-react/lib/core";
import { BarChart, BarSeriesOption } from "echarts/charts";
import {
    GridComponent,
    GridComponentOption,
    TooltipComponent,
    TooltipComponentOption,
    DataZoomComponent,
    DataZoomComponentOption
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { ComposeOption } from "echarts/core";

// Register chart components
echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer, DataZoomComponent]);

type ECOption = ComposeOption<
    | BarSeriesOption
    | TooltipComponentOption
    | GridComponentOption
    | DataZoomComponentOption
>;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: number[];
}

interface Bin {
    label: string;
    min: number;
    max: number;
    count: number;
    color: string;
}

const HpDistributionModal: React.FC<Props> = ({ isOpen, onClose, title, data }) => {
    const bins = useMemo(() => {
        if (!data || data.length === 0) return [];

        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);

        // If all values are the same, create a single centered bin or small range
        if (minVal === maxVal) {
            const val = minVal;
            return [{
                label: `${val}`,
                min: val,
                max: val + 1,
                count: data.length,
                color: val >= 200 ? '#22c55e' : val >= 100 ? '#4ade80' : val >= 0 ? '#86efac' : val >= -100 ? '#fca5a5' : val >= -200 ? '#f87171' : '#ef4444'
            }];
        }

        const range = maxVal - minVal;
        const targetBinCount = 15; // Increased target for histogram
        let rawStep = range / targetBinCount;

        // Calculate nice step
        const powerOf10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalizedStep = rawStep / powerOf10;

        let step;
        if (normalizedStep < 1.5) step = 1 * powerOf10;
        else if (normalizedStep < 3.5) step = 2 * powerOf10;
        else if (normalizedStep < 7.5) step = 5 * powerOf10;
        else step = 10 * powerOf10;

        step = Math.max(step, 1);

        const start = Math.floor(minVal / step) * step;

        const computedBins: Bin[] = [];
        // Helper to get color based on midpoint
        const getColor = (mid: number) => {
            if (mid >= 200) return '#22c55e'; // Deep Green
            if (mid >= 100) return '#4ade80'; // Green
            if (mid >= 0) return '#86efac';   // Light Green
            if (mid >= -100) return '#fca5a5'; // Light Red
            if (mid >= -200) return '#f87171'; // Red
            return '#ef4444';                  // Deep Red
        };

        let current = start;
        let safety = 0;
        // Ensure we cover maxVal
        const chartMax = Math.ceil(maxVal / step) * step;

        while (current < chartMax + (step / 100) && safety < 100) {
            const binMin = current;
            const binMax = current + step;
            const mid = (binMin + binMax) / 2;

            computedBins.push({
                label: `${binMin}`, // X Axis label
                min: binMin,
                max: binMax,
                count: 0,
                color: getColor(mid)
            });
            current += step;
            safety++;
        }

        // Fill counts
        data.forEach(val => {
            const bin = computedBins.find(b => val >= b.min && val < b.max);
            if (bin) {
                bin.count++;
            } else {
                if (val >= computedBins[computedBins.length - 1].max) {
                    computedBins[computedBins.length - 1].count++;
                }
            }
        });

        return computedBins;
    }, [data]);

    const totalCount = data.length;

    const options: ECOption = useMemo(() => {
        return {
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    const item = params[0];
                    if (!item) return '';
                    const bin = bins[item.dataIndex];
                    if (!bin) return '';
                    const pct = ((bin.count / totalCount) * 100).toFixed(1);
                    return `${bin.min} to ${bin.max}<br/>Count: <b>${bin.count}</b> (${pct}%)`;
                },
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                borderColor: '#666',
                textStyle: { color: '#fff' }
            },
            grid: {
                top: 20,
                bottom: 30,
                left: 20,
                right: 20,
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: bins.map(b => b.label),
                axisLabel: { color: '#cbd5e1' },
                axisLine: { lineStyle: { color: '#475569' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#cbd5e1' },
                axisLine: { lineStyle: { color: '#475569' } },
                splitLine: { lineStyle: { color: '#334155', type: 'dashed' } }
            },
            series: [
                {
                    data: bins.map(b => ({
                        value: b.count,
                        itemStyle: { color: b.color }
                    })),
                    type: 'bar',
                    barCategoryGap: '10%'
                }
            ]
        };
    }, [bins, totalCount]);

    const chartRef = useRef<any>(null);

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        if (isOpen) {
            // Wait for modal transition/rendering to complete
            timeoutId = setTimeout(() => {
                if (chartRef.current) {
                    try {
                        const echartsInstance = chartRef.current.getEchartsInstance();
                        echartsInstance.resize();
                    } catch (e) {
                        // ignore if instance not ready
                    }
                }
            }, 100);
        }
        return () => clearTimeout(timeoutId);
    }, [isOpen]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            if (chartRef.current) {
                try {
                    chartRef.current.getEchartsInstance().resize();
                } catch (e) { }
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <Modal show={isOpen} onHide={onClose} centered size="xl" contentClassName="bg-dark text-light border-secondary">
            <Modal.Header closeButton className="border-secondary">
                <Modal.Title style={{ fontSize: '1.2rem' }}>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div style={{ marginBottom: '15px', color: '#a0aec0', fontSize: '0.9em' }}>
                    Total Samples: {totalCount}
                </div>
                <div style={{ width: '100%', height: '70vh' }}>
                    {/* @ts-ignore */}
                    <EChartsReactCore
                        ref={chartRef}
                        echarts={echarts}
                        option={options}
                        style={{ height: '100%', width: '100%', minHeight: '400px' }}
                        theme="dark"
                    />
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default HpDistributionModal;
