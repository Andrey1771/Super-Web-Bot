import React from "react";

type Link = { network: string; url: string };
type Network = { network: string; title: string; example: string };

/**
 * Ссылки на соцсети в подвале: по полю на каждую сеть, для которой у подвала есть иконка.
 * Пустое поле — иконки этой сети в подвале нет. Сервер принимает только https-адрес профиля на
 * домене своей сети (t.me, discord.gg, x.com) и объяснит, если адрес не подходит.
 */
const SocialLinksEditor: React.FC<{
  value: Link[];
  networks: Network[];
  onChange: (next: Link[] | null) => void;
}> = ({ value, networks, onChange }) => {
  const urlOf = (network: string) => value.find((link) => link.network === network)?.url ?? "";

  const update = (network: string, url: string) => {
    const next = networks
      .map((n) => ({ network: n.network, url: n.network === network ? url : urlOf(n.network) }))
      .filter((link) => link.url.trim().length > 0);
    onChange(next.length > 0 ? next : null);
  };

  return (
    <div className="site-settings__grid">
      {networks.map((n) => (
        <label key={n.network} className="site-settings__field">
          <span className="site-settings__label">{n.title}</span>
          <span className="site-settings__control">
            <input
              className="input"
              type="url"
              inputMode="url"
              value={urlOf(n.network)}
              placeholder={n.example}
              onChange={(event) => update(n.network, event.target.value)}
            />
          </span>
        </label>
      ))}
    </div>
  );
};

export default SocialLinksEditor;
