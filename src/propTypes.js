import PropTypes from 'prop-types';

export const activityPropType = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  label: PropTypes.string.isRequired,
  color: PropTypes.string,
  errorMessage: PropTypes.string,
});

export const activitiesByDayPropType = PropTypes.objectOf(
  PropTypes.arrayOf(activityPropType).isRequired,
);
