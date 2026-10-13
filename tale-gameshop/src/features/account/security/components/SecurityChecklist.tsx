import {useTranslation} from 'react-i18next';
import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCheck, faChevronRight, faShieldHalved, faXmark} from '@fortawesome/free-solid-svg-icons';

export type SecurityChecklistStep = {
    key: string;
    label: string;
    done: boolean;
    /** Карточка, где этот шаг делается: сводка ведёт к ней, а не дублирует её кнопку. */
    targetId: string;
};

type SecurityChecklistProps = {
    show: boolean;
    steps: SecurityChecklistStep[];
    onDismiss: () => void;
};

const SecurityChecklist: React.FC<SecurityChecklistProps> = ({show, steps, onDismiss}) => {
    const {t} = useTranslation();
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
                    <h2>{t('account.security.checklist.title')}</h2>
                    <p>{t('account.security.checklist.progress', {done: completed, total: steps.length})}</p>
                </div>
                <button
                    type="button"
                    className="security-checklist-dismiss"
                    aria-label={t('session.dismiss')}
                    title={t('session.dismiss')}
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
                        {/* Следующий шаг — ссылка к его карточке ниже. Своей кнопки действия у сводки нет: раньше
                            «Enable 2FA» стояла и здесь, и в карточке 2FA прямо под ней. */}
                        {step === nextStep ? (
                            <button
                                type="button"
                                className="security-checklist-goto"
                                onClick={() => document.getElementById(step.targetId)?.scrollIntoView({behavior: 'smooth', block: 'start'})}
                            >
                                <span>{step.label}</span>
                                <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                            </button>
                        ) : (
                            <span className="security-checklist-label">{step.label}</span>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default SecurityChecklist;
