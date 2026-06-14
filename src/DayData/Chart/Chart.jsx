import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
} from 'chart.js';
import PropTypes from 'prop-types';
import { Bar, Doughnut, Pie, Radar } from 'react-chartjs-2';
import { activityPropType } from '../../propTypes.js';
import './Chart.css';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
);
ChartJS.defaults.font.family = 'Raleway';

const CHART_TYPES = ['Pie', 'Bar', 'Radar', 'Doughnut'];
const CHART_COMPONENTS = {
  bar: Bar,
  doughnut: Doughnut,
  pie: Pie,
  radar: Radar,
};

function Chart({
  id,
  timeUnit,
  activities,
  chartType,
  onChartTypeChange,
}) {
  const chartActivities = activities.filter(
    (activity) => activity.id !== '?' && activity.value !== 0,
  );
  const labels = chartActivities.map((activity) => activity.label);
  const hours = chartActivities.map((activity) => activity.value);
  const colors = chartActivities.map((activity) => activity.color);
  const maxValue = Math.max(...hours);
  const isRadar = chartType === 'radar';
  const isCircular = ['pie', 'doughnut'].includes(chartType);

  const data = {
    labels,
    datasets: [
      {
        data: hours,
        ...(isRadar
          ? { pointBackgroundColor: colors }
          : { backgroundColor: colors }),
        ...(isCircular
          ? { borderWidth: chartActivities.length < 2 ? 0 : 0.9 }
          : {}),
      },
    ],
  };
  const options = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: () => '',
          label: (context) => {
            const label = context.label;
            const value = context.parsed.r ?? context.parsed.y ?? context.parsed;
            const percentage = Math.round((value / 24) * 100);
            return label
              ? ` ${label}: ${value} hours (${percentage}%)`
              : ` ${value} hours (${percentage}%)`;
          },
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  };

  if (chartType === 'bar') {
    options.scales = {
      y: { beginAtZero: true, max: maxValue },
      x: { ticks: { autoSkip: false } },
    };
  } else if (isRadar) {
    options.scales = {
      r: { beginAtZero: true, max: maxValue },
    };
  }

  const ChartComponent = CHART_COMPONENTS[chartType] ?? Pie;

  return (
    <div className={`chart-container ${timeUnit}`}>
      <div
        id={`buttons${id}`}
        className={`chart-button-container ${timeUnit}`}
      >
        {CHART_TYPES.map((type) => {
          const normalizedType = type.toLowerCase();
          const iconClass = ['Radar', 'Doughnut'].includes(type)
            ? 'material-icons'
            : `fas fa-chart-${normalizedType}`;

          return (
            <button
              key={type}
              id={`${normalizedType}${id}`}
              className={`${normalizedType} chart-button ${timeUnit}${
                normalizedType === chartType ? ' selected' : ''
              }`}
              onClick={() => onChartTypeChange(id, normalizedType)}
              title={`${type} chart`}
              aria-pressed={normalizedType === chartType}
            >
              <i className={iconClass} aria-hidden="true">
                {type === 'Radar'
                  ? 'track_changes'
                  : type === 'Doughnut'
                    ? 'donut_small'
                    : null}
              </i>
            </button>
          );
        })}
      </div>
      <div className={`chart-visual-container ${timeUnit}`}>
        <ChartComponent data={data} options={options} />
      </div>
    </div>
  );
}

export default Chart;

Chart.propTypes = {
  id: PropTypes.number.isRequired,
  timeUnit: PropTypes.oneOf(['day', 'week', 'month']).isRequired,
  activities: PropTypes.arrayOf(activityPropType).isRequired,
  chartType: PropTypes.oneOf(['pie', 'bar', 'radar', 'doughnut']).isRequired,
  onChartTypeChange: PropTypes.func.isRequired,
};
