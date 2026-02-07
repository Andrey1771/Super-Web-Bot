import React from "react";

type QuickRepliesProps = {
  options: string[];
  onSelect: (value: string) => void;
};

const QuickReplies: React.FC<QuickRepliesProps> = ({ options, onSelect }) => {
  return (
    <div className="support-chat__quick-replies" role="list">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="support-chat__chip"
          onClick={() => onSelect(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

export default QuickReplies;
