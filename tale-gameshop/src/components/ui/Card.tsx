import React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

const Card: React.FC<CardProps> = ({ className = "", ...props }) => {
  return <div className={`admin-card ${className}`} {...props} />;
};

export default Card;
