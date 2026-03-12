const STEP_ITEMS = [
  { step: 1, label: "Build Order" },
  { step: 2, label: "Customer & Notes" },
  { step: 3, label: "Payment" },
  { step: 4, label: "Confirm & Receipt" },
];

function PosStepperHeader({ currentStep, completedSteps, onStepClick, disabled = false }) {
  return (
    <nav className="pos-stepper" aria-label="POS checkout steps">
      <ol className="pos-stepper__list">
        {STEP_ITEMS.map((item) => {
          const isCurrent = item.step === currentStep;
          const isComplete = completedSteps.has(item.step);
          const canClick = !disabled && isComplete && !isCurrent;
          return (
            <li
              key={item.step}
              className={`pos-stepper__item ${
                isCurrent ? "is-current" : isComplete ? "is-complete" : "is-future"
              }`}
            >
              <button
                className="pos-stepper__button"
                type="button"
                onClick={() => {
                  if (canClick) {
                    onStepClick(item.step);
                  }
                }}
                disabled={!canClick}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="pos-stepper__badge" aria-hidden="true">
                  {isComplete ? "\u2713" : item.step}
                </span>
                <span className="pos-stepper__text">
                  <span className="pos-stepper__eyebrow">Step {item.step}</span>
                  <span className="pos-stepper__label">{item.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default PosStepperHeader;
