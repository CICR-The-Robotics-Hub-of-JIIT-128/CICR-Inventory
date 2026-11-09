import React from 'react';
import { PaymentStatus } from '../ui/payment-status';
import { BorrowRequest, InventoryItem } from '../../types/inventory';
import {
  extractIdentityFromEmail,
  isDirtyOrPlaceholderName,
  stripRollTokensFromName,
  toCleanDisplayName,
} from '../../lib/identity';

interface IssuePassModalProps {
  request: BorrowRequest | null;
  item?: InventoryItem;
  onClose: () => void;
}

export const IssuePassModal: React.FC<IssuePassModalProps> = ({
  request,
  onClose,
}) => {
  if (!request) return null;

  const extracted = extractIdentityFromEmail(request.user_email, {
    full_name: request.user_name,
  });
  const borrowerName = !isDirtyOrPlaceholderName(request.user_name, request.user_email)
    ? toCleanDisplayName(request.user_name)
    : extracted.fullName || 'Member';
  const borrowerRoll = extracted.enrollmentNo;
  const cleanApprover =
    stripRollTokensFromName(request.approved_by) || request.approved_by || 'Lab Administrator';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <PaymentStatus
        type="loan"
        status="success"
        title="Official Hardware Issue Pass"
        subtitle={`Clearance authorized by ${cleanApprover}. Present this pass at CICR Lab to collect your component.`}
        amount={`${request.quantity} unit(s)`}
        amountLabel="Issued Quantity"
        transactionId={`ISSUE-${request.id.slice(0, 8).toUpperCase()}`}
        transactionLabel="Gate Pass Ref"
        paymentMethod={`${borrowerName}${borrowerRoll ? ` (${borrowerRoll})` : ''}`}
        paymentMethodLabel="Issued To"
        items={[
          {
            name: request.item_name,
            quantity: request.quantity,
            price: `${request.quantity}x unit`,
          },
        ]}
        merchantName="CICR Robotics Lab"
        primaryActionLabel="Close Gate Pass"
        onClose={onClose}
      />
    </div>
  );
};
