import { useT } from '../i18n';

interface Props {
  question: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

// A question with its two answers, shown in place of the control that asked it.
export function ConfirmBar({ question, confirmLabel, onConfirm, onCancel }: Props) {
  const { t } = useT();
  return (
    <div className="cfm" role="group" aria-label={question}>
      <span>{question}</span>
      <span className="cfm-btns">
        <button type="button" className="btn pri" autoFocus onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="btn" onClick={onCancel}>{t('common.cancel')}</button>
      </span>
    </div>
  );
}
