import type { TrendPoint } from "../lib/demo-data";

type ForecastChartProps = {
  data: TrendPoint[];
  compact?: boolean;
};

function scaleValue(value: number | undefined, min: number, max: number) {
  if (value === undefined) return 0;
  return Math.max(10, Math.round(((value - min) / (max - min)) * 78 + 14));
}

export function ForecastChart({ data, compact = false }: ForecastChartProps) {
  const values = data.map((point) => point.actual ?? point.forecast ?? 0);
  const min = Math.min(...values) - 8;
  const max = Math.max(...values) + 8;
  const todayIndex = Math.max(0, data.findIndex((point) => point.forecast !== undefined));

  return (
    <div className={`forecast-chart ${compact ? "forecast-chart-compact" : ""}`}>
      <div className="chart-scale" aria-hidden="true">
        <span>{max}</span>
        <span>{Math.round((max + min) / 2)}</span>
        <span>{min}</span>
      </div>
      <div className="chart-plot" role="img" aria-label="กราฟเปรียบเทียบ Actual และ Forecast Demand">
        <div className="chart-grid-lines" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div
          className="chart-today-marker"
          style={{ left: `${todayIndex > 0 ? (todayIndex / data.length) * 100 : 54}%` }}
          aria-hidden="true"
        >
          <span>Today</span>
        </div>
        <div className="chart-columns">
          {data.map((point, index) => {
            const value = point.actual ?? point.forecast ?? 0;
            const isForecast = point.forecast !== undefined && point.actual === undefined;
            return (
              <div className="chart-column" key={`${point.label}-${index}`}>
                <div className="chart-bar-slot">
                  <div
                    className={`chart-bar ${isForecast ? "chart-bar-forecast" : "chart-bar-actual"}`}
                    style={{ height: `${scaleValue(value, min, max)}%` }}
                    title={`${point.label}: ${value}k units`}
                  >
                    <span className="chart-bar-dot" />
                  </div>
                </div>
                <span className="chart-label">{point.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="chart-legend">
        <span><i className="legend-dot legend-actual" /> Actual demand</span>
        <span><i className="legend-dot legend-forecast" /> AI Forecast</span>
        <span className="chart-units">หน่วย: พันชิ้น</span>
      </div>
    </div>
  );
}
