import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCheck, faShieldHalved, faXmark} from '@fortawesome/free-solid-svg-icons';

export type SecurityChecklistStep = {
    key: string;
    label: string;
    done: boolean;
    actionLabel: string;
    onAction: () => void;
};

type SecurityChecklistProps = {
    show: boolean;
    steps: SecurityChecklistStep[];
    isBusy: boolean;
    onDismiss: () => void;
};

const SecurityChecklist: React.FC<SecurityChecklistProps> = ({show, steps, isBusy, onDismiss}) => {
    if (!show) {
        return null;
    }

    const completed = steps.filter((step) => step.done).length;
    const nextStep = steps.find((step) => !step.done);
    const progress = Math.round((completed / steps.length) * 100);

    return (
        <section className="card security-checklist" data-testid="security-checklist">
            <div className="security-checklist-header">
                <div className="security-checklist-icon" aria-hidden="true">
                    <FontAwesomeIcon icon={faShieldHalved} />
                </div>
                <div className="security-checklist-title">
                    <h2>Protect your account</h2>
                    <p>{completed} of {steps.length} steps complete</p>
                </div>
                <button
                    type="button"
                    className="security-checklist-dismiss"
                    aria-label="Dismiss"
                    title="Dismiss"
                    onClick={onDismiss}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>
            <div className="security-checklist-progress" role="progressbar" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={steps.length}>
                <div className="security-checklist-progress-fill" style={{width: `${progress}%`}} />
            </div>
            <ul className="security-checklist-steps">
                {steps.map((step) => (
                    <li
                        key={step.key}
                        className={`security-checklist-step ${step.done ? 'is-done' : ''}`}
                    >
                        <span className="security-checklist-mark" aria-hidden="true">
                            {step.done && <FontAwesomeIcon icon={faCheck} />}
                        </span>
                        <span className="security-checklist-label">{step.label}</span>
                        {step === nextStep && (
                            <button
                                type="button"
                                className="btn btn-primary security-checklist-btn"
                                onClick={step.onAction}
                                disabled={isBusy}
                            >
                                {step.actionLabel}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default SecurityChecklist;
