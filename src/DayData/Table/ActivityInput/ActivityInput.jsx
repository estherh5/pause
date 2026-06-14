import PropTypes from 'prop-types';
import './ActivityInput.css';

function ActivityInput({
  id,
  dataId,
  className,
  type,
  placeholder,
  min,
  max,
  step,
  value,
  inputRef,
  onBlur,
  onEnter,
}) {
  function submitValue(event) {
    if (event.key !== 'Enter') {
      return;
    }

    if (dataId === '?') {
      onEnter();
    } else {
      event.currentTarget.blur();
    }
  }

  function getValue(event) {
    if (dataId === '?') {
      return;
    }

    const inputValue = type === 'number'
      ? Number.parseFloat(event.currentTarget.value)
      : event.currentTarget.value.trim();
    onBlur(Number(dataId), inputValue);
  }

  return (
    <input
      ref={inputRef}
      id={`${type}${id}`}
      className={className}
      data-id={dataId}
      type={type}
      placeholder={placeholder}
      title={placeholder}
      min={min}
      max={max}
      step={step}
      defaultValue={value}
      onBlur={getValue}
      onKeyDown={submitValue}
    />
  );
}

export default ActivityInput;

ActivityInput.propTypes = {
  id: PropTypes.string.isRequired,
  dataId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  className: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['text', 'number']).isRequired,
  placeholder: PropTypes.string.isRequired,
  min: PropTypes.string,
  max: PropTypes.string,
  step: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  inputRef: PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
  onBlur: PropTypes.func.isRequired,
  onEnter: PropTypes.func.isRequired,
};
