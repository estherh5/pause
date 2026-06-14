import PropTypes from 'prop-types';
import { createStartingActivities } from '../activities.js';
import './StarterButtons.css';

const STARTER_SETS = {
  student: [
    { id: 0, value: 0, label: '' },
    { id: 1, value: 8, label: 'sleep' },
    { id: 2, value: 0.25, label: 'breakfast' },
    { id: 3, value: 6, label: 'class' },
    { id: 4, value: 0.5, label: 'lunch' },
    { id: 5, value: 3, label: 'homework' },
    { id: 6, value: 0.5, label: 'dinner' },
    { id: 7, value: 4, label: 'studying' },
    { id: 8, value: 1.75, label: 'relax' },
  ],
  professional: [
    { id: 0, value: 0, label: '' },
    { id: 1, value: 8, label: 'sleep' },
    { id: 2, value: 0.5, label: 'breakfast' },
    { id: 3, value: 8, label: 'work' },
    { id: 4, value: 0.5, label: 'lunch' },
    { id: 5, value: 1, label: 'working out' },
    { id: 6, value: 0.5, label: 'dinner' },
    { id: 7, value: 5.5, label: 'relaxing' },
  ],
  retired: [
    { id: 0, value: 0, label: '' },
    { id: 1, value: 8, label: 'sleep' },
    { id: 2, value: 0.5, label: 'breakfast' },
    { id: 3, value: 2, label: 'exercise' },
    { id: 4, value: 0.5, label: 'lunch' },
    { id: 5, value: 2, label: 'gardening' },
    { id: 6, value: 4, label: 'volunteering' },
    { id: 7, value: 2, label: 'reading' },
    { id: 8, value: 1, label: 'dinner' },
    { id: 9, value: 1, label: 'watching tv' },
    { id: 10, value: 1, label: 'taking a walk' },
    { id: 11, value: 2, label: 'family time' },
  ],
};

function StarterButtons({ disabled, onButtonClick }) {
  function toggleActivities(type) {
    const activities = type === 'clear'
      ? createStartingActivities()
      : STARTER_SETS[type].map((activity) => ({ ...activity }));
    onButtonClick(activities);
  }

  return (
    <div>
      {['Student', 'Professional', 'Retired', 'Clear'].map((type) => {
        const key = type.toLowerCase();
        return (
          <button
            key={key}
            id={key}
            title={`${type} activities`}
            disabled={disabled}
            onClick={() => toggleActivities(key)}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}

export default StarterButtons;

StarterButtons.propTypes = {
  disabled: PropTypes.bool.isRequired,
  onButtonClick: PropTypes.func.isRequired,
};
