import React from "react";

/** Ширина «полоски» на месте почты, пока профиль грузится (не показывается — только задаёт размер). */
export const EMAIL_SKELETON = "name@example.com";

/**
 * Почта, которая переносится только перед «@»: «demo-admin / @taleshop-demo.invalid», а не по дефису внутри домена.
 * Каждая половина сама по себе не рвётся; если и она не влезает (очень длинный адрес), её ломает overflow-wrap родителя.
 */
const EmailText: React.FC<{ email: string | null | undefined }> = ({ email }) => {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return <>{email}</>;
  return (
    <>
      <span className="email-text__part">{email.slice(0, at)}</span>
      <wbr />
      <span className="email-text__part">{email.slice(at)}</span>
    </>
  );
};

export default EmailText;
