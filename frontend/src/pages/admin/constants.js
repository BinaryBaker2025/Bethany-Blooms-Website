const DEFAULT_SLOT_CAPACITY = 10;
const AUTO_REPEAT_DAYS = 90;

const createTimeSlot = () => ({
  id: `time-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  time: "",
  label: "",
  capacity: String(DEFAULT_SLOT_CAPACITY),
});

const createDateGroup = () => ({
  id: `date-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  date: "",
  times: [createTimeSlot()],
});

export {
  DEFAULT_SLOT_CAPACITY,
  AUTO_REPEAT_DAYS,
  createTimeSlot,
  createDateGroup,
};
