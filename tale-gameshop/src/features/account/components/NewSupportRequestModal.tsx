import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {Link} from 'react-router-dom';
import {createSupportTicket, uploadSupportAttachment} from '../support/supportApi';
import type {CreateSupportTicketPayload, SupportTicket} from '../support/types';
import {supportDocs} from '../../../content/support/docs';
import '../pages/account-help-new-request-modal.css';

interface NewSupportRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmitted: (ticket: SupportTicket) => Promise<void> | void;
    openerRef?: React.RefObject<HTMLElement>;
}

const issueOptions = [
    'Payment & checkout',
    'Key delivery / activation',
    'Refund request',
    'Account & security',
    'Technical issue / bug',
    'Other'
];

const quickActionIds = ['activation-guide', 'refund-policy', 'payment-methods'];
const quickActions = supportDocs
    .filter((doc) => quickActionIds.includes(doc.id))
    .map((doc) => ({label: doc.title, to: doc.route}));

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

const formatFileSize = (size: number): string => {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const NewSupportRequestModal: React.FC<NewSupportRequestModalProps> = ({isOpen, onClose, onSubmitted, openerRef}) => {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const firstFieldRef = useRef<HTMLSelectElement | null>(null);
    const [category, setCategory] = useState('');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [errors, setErrors] = useState({category: '', subject: '', description: ''});
    const [attachmentError, setAttachmentError] = useState('');
    const [submitError, setSubmitError] = useState('');
    const [submitWarning, setSubmitWarning] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isFormReady = useMemo(() => {
        return Boolean(category && subject.trim() && description.trim() && !attachmentError);
    }, [attachmentError, category, description, subject]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (!isSubmitting) {
                    handleRequestClose('esc');
                }
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const dialog = dialogRef.current;
            if (!dialog) {
                return;
            }

            const focusable = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )
            ).filter((element) => !element.hasAttribute('disabled'));

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;

            if (event.shiftKey) {
                if (!activeElement || activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (!activeElement || activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        requestAnimationFrame(() => {
            firstFieldRef.current?.focus();
        });

        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            openerRef?.current?.focus();
        };
    }, [isOpen, isSubmitting, onClose, openerRef]);

    useEffect(() => {
        if (isOpen) {
            setCategory('');
            setSubject('');
            setDescription('');
            setAttachments([]);
            setErrors({category: '', subject: '', description: ''});
            setAttachmentError('');
            setSubmitError('');
            setSubmitWarning('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    const updateAttachments = (files: File[]) => {
        const incoming = files.filter((file) => ALLOWED_TYPES.includes(file.type));
        const invalidFiles = files.filter((file) => !ALLOWED_TYPES.includes(file.type));

        if (invalidFiles.length > 0) {
            setAttachmentError('Unsupported file format. Please upload PNG, JPG, or PDF files.');
            return;
        }

        const nextFiles = [...attachments, ...incoming];
        if (nextFiles.length > MAX_ATTACHMENTS) {
            setAttachmentError(`You can upload up to ${MAX_ATTACHMENTS} files.`);
            return;
        }

        const oversized = nextFiles.find((file) => file.size > MAX_FILE_SIZE);
        if (oversized) {
            setAttachmentError('Each file must be 10MB or smaller.');
            return;
        }

        setAttachmentError('');
        setAttachments(nextFiles);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) {
            return;
        }
        updateAttachments(Array.from(event.target.files));
        event.target.value = '';
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        updateAttachments(Array.from(event.dataTransfer.files));
    };

    const handleRemoveAttachment = (fileName: string) => {
        setAttachments((prev) => prev.filter((file) => file.name !== fileName));
    };

    const validate = () => {
        const nextErrors = {
            category: category ? '' : 'Please select an issue category.',
            subject: subject.trim() ? '' : 'Subject is required.',
            description: description.trim() ? '' : 'Description is required.'
        };
        setErrors(nextErrors);
        return nextErrors;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitError('');
        setSubmitWarning('');
        const nextErrors = validate();
        const hasErrors = Object.values(nextErrors).some(Boolean) || Boolean(attachmentError);
        if (hasErrors) {
            return;
        }

        setIsSubmitting(true);
        try {
            const payload: CreateSupportTicketPayload = {
                category,
                subject: subject.trim(),
                description: description.trim()
            };
            const created = await createSupportTicket(payload);

            if (attachments.length > 0 && created.firstMessageId) {
                try {
                    await uploadSupportAttachment(created.ticket.id, created.firstMessageId, attachments);
                } catch (error) {
                    console.warn('Attachment upload failed', error);
                    setSubmitWarning('Ticket created, but attachments failed. You can add them in a follow-up.');
                }
            }

            await onSubmitted(created.ticket);
            onClose();
        } catch (error) {
            console.error('Failed to create support request', error);
            setSubmitError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const hasDraft = Boolean(category || subject.trim() || description.trim() || attachments.length > 0);

    const handleRequestClose = (reason: 'overlay' | 'button' | 'esc') => {
        if (isSubmitting) {
            return;
        }
        if (hasDraft && !window.confirm('Discard draft?')) {
            return;
        }
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    return ReactDOM.createPortal(
        <div
            className="new-request-modal-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    handleRequestClose('overlay');
                }
            }}
        >
            <div
                className="new-request-modal"
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-request-title"
                aria-describedby="new-request-description"
            >
                <div className="new-request-modal-header">
                    <h2 id="new-request-title">Submit a new request</h2>
                    <button
                        type="button"
                        className="new-request-modal-close"
                        onClick={() => handleRequestClose('button')}
                        aria-label="Close"
                        disabled={isSubmitting}
                    >
                        ×
                    </button>
                </div>
                <div className="new-request-modal-body">
                    <form className="new-request-form" id="new-request-form" onSubmit={handleSubmit}>
                        {submitError && <div className="new-request-form-error">{submitError}</div>}
                        <div className="new-request-form-field">
                            <label htmlFor="support-issue">What can we help you with? <span aria-hidden="true">*</span></label>
                            <select
                                id="support-issue"
                                ref={firstFieldRef}
                                value={category}
                                onChange={(event) => {
                                    setCategory(event.target.value);
                                    if (errors.category) {
                                        setErrors((prev) => ({...prev, category: ''}));
                                    }
                                }}
                                className={errors.category ? 'has-error' : ''}
                                required
                            >
                                <option value="" disabled>
                                    Select an issue...
                                </option>
                                {issueOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                            {errors.category && <span className="field-error">{errors.category}</span>}
                        </div>

                        <div className="new-request-form-field">
                            <label htmlFor="support-subject">Subject <span aria-hidden="true">*</span></label>
                            <input
                                id="support-subject"
                                type="text"
                                value={subject}
                                onChange={(event) => {
                                    setSubject(event.target.value);
                                    if (errors.subject) {
                                        setErrors((prev) => ({...prev, subject: ''}));
                                    }
                                }}
                                placeholder="Enter a brief subject"
                                className={errors.subject ? 'has-error' : ''}
                                required
                            />
                            {errors.subject && <span className="field-error">{errors.subject}</span>}
                        </div>

                        <div className="new-request-form-field">
                            <label htmlFor="support-description">Description <span aria-hidden="true">*</span></label>
                            <textarea
                                id="support-description"
                                value={description}
                                onChange={(event) => {
                                    setDescription(event.target.value);
                                    if (errors.description) {
                                        setErrors((prev) => ({...prev, description: ''}));
                                    }
                                }}
                                placeholder="Describe your issue or question in detail..."
                                rows={5}
                                className={errors.description ? 'has-error' : ''}
                                required
                            />
                            {errors.description && <span className="field-error">{errors.description}</span>}
                        </div>

                        <div className="new-request-form-field">
                            <span className="new-request-attach-title">Attach file <span className="muted">(optional)</span></span>
                            <div
                                className="new-request-attach-box"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={handleDrop}
                            >
                                <input
                                    id="support-attachments"
                                    type="file"
                                    accept="image/png,image/jpeg,application/pdf"
                                    multiple
                                    onChange={handleFileChange}
                                    className="new-request-file-input"
                                />
                                <label htmlFor="support-attachments" className="new-request-attach-label">
                                    <span className="new-request-attach-button">Choose file</span>
                                    <span className="new-request-attach-text">Attach screenshots, receipts, or other files.</span>
                                </label>
                            </div>
                            {attachmentError && <span className="field-error">{attachmentError}</span>}
                            {attachments.length > 0 && (
                                <ul className="new-request-attachment-list">
                                    {attachments.map((file) => (
                                        <li key={file.name}>
                                            <span>
                                                {file.name} · {formatFileSize(file.size)}
                                            </span>
                                            <button
                                                type="button"
                                                className="new-request-remove"
                                                onClick={() => handleRemoveAttachment(file.name)}
                                            >
                                                Remove
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <p id="new-request-description" className="new-request-note">
                            Our team responds 24/7. Average response time: 2–4 hours.
                        </p>
                        {submitWarning && <div className="new-request-form-warning">{submitWarning}</div>}
                    </form>

                    <aside className="new-request-quick-actions">
                        <h3>Quick actions</h3>
                        <div className="new-request-quick-list">
                            {quickActions.map((action) => (
                                <Link key={action.label} to={action.to} className="new-request-quick-link">
                                    {action.label}
                                </Link>
                            ))}
                        </div>
                        <p className="new-request-quick-note">
                            Looking for answers? Browse guides or policies while we review your request.
                        </p>
                    </aside>
                </div>
                <div className="new-request-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={() => handleRequestClose('button')} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="new-request-form"
                        className="btn btn-primary"
                        disabled={!isFormReady || isSubmitting}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit request'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default NewSupportRequestModal;
