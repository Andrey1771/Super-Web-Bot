import { useTranslation } from "react-i18next";
import React, { useEffect, useRef } from "react";
import PageMeta from "../common/PageMeta";
import RewardsHeroScene from "./RewardsHeroScene";
import CashbackOrderCard from "./CashbackOrderCard";
import CashbackPass from "./CashbackPass";
import CashbackFaq from "./CashbackFaq";
import CashbackWhere from "./CashbackWhere";
import { useReveal } from "./useReveal";
import { useSettled } from "./useSettled";
import { useCashbackProgram } from "../../hooks/use-cashback-program";
import "./rewards-page.css";

/**
 * Публичная страница кэшбэка.
 *
 * Открыта всем, включая не вошедших, — на неё ведёт карточка в герое главной, и человек,
 * который ещё не завёл аккаунт, должен понять предложение до регистрации.
 *
 * Порядок блоков и тексты свои. Первая версия повторяла страницу DIFMARK почти один в один:
 * «Short info → Few simple steps → таблица уровней → What if…», с их же подписями и
 * названиями уровней. Теперь: шапка → чем кэшбэк отличается от скидки → «Cashback pass»
 * (уровни треком, шаги цепочкой) → где увидишь (CashbackWhere) → вопросы (CashbackFaq).
 * Ритм фона: тёмное → светлое → тёмное → белое → лавандовое → тёмный подвал.
 *
 * Чего здесь намеренно нет — счётчиков вроде «500 000 покупателей уже получили кэшбэк»:
 * у нас таких чисел не существует, а придумывать их — то же, что придумывать отзывы.
 */

/** Задержка появления для CSS: у каждого элемента шапки своя очередь. */
const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as React.CSSProperties;

/**
 * Рисунок в шапке чуть уходит за курсором — слои с разной силой, как будто у картинки есть
 * глубина. Пишем в CSS-переменные напрямую, мимо React: перерисовка страницы на каждое
 * движение мыши ради сдвига на пару пикселей — перебор. На тач-экранах и при
 * prefers-reduced-motion не включается вовсе.
 */
function useHeroParallax() {
    const ref = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof window.matchMedia !== "function") {
            return;
        }
        const allowed =
            window.matchMedia("(pointer: fine)").matches &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!allowed) {
            return;
        }

        let frame = 0;
        const onMove = (event: PointerEvent) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const box = el.getBoundingClientRect();
                const x = ((event.clientX - box.left) / box.width) * 2 - 1;
                const y = ((event.clientY - box.top) / box.height) * 2 - 1;
                el.style.setProperty("--px", x.toFixed(3));
                el.style.setProperty("--py", y.toFixed(3));
            });
        };
        const onLeave = () => {
            cancelAnimationFrame(frame);
            el.style.setProperty("--px", "0");
            el.style.setProperty("--py", "0");
        };

        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        return () => {
            cancelAnimationFrame(frame);
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    return ref;
}

const RewardsPage: React.FC = () => {
    const { t } = useTranslation();
    const { tiers } = useCashbackProgram();
    const top = tiers[tiers.length - 1];
    const start = tiers[0];
    const heroRef = useHeroParallax();
    // Текст шапки: последнее появление (линия под «comes back») заканчивается к 2.35 с.
    const heroSettled = useSettled(true, 2600);
    const [whatRef, whatShown] = useReveal<HTMLDivElement>(0.3);
    const shown = (flag: boolean) => (flag ? " is-in" : "");

    return (
        <div className="rewards-page">
            <PageMeta
                title={t("rewards.metaTitle")}
                description={t("rewards.metaDesc", { percent: start.percent })}
                canonicalPath="/rewards"
            />

            <section className={`rewards-hero${heroSettled ? " is-settled" : ""}`} ref={heroRef}>
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb rewards-orb-1" aria-hidden="true"></i>
                <i className="fx-orb is-magenta rewards-orb-2" aria-hidden="true"></i>
                <div className="container rewards-hero-grid">
                  <div className="rewards-hero-inner">
                    <span className="rewards-eyebrow rw-enter" style={delay(0)}>{t("rewards.eyebrow")}</span>
                    {/* Линия под «comes back» дорисовывается, когда в рисунке справа ляжет
                        кошелёк: текст и картинка договаривают одну мысль. */}
                    <h1 className="rw-enter" style={delay(0.08)}>
                        {t("rewards.heroBefore")}<span className="rewards-hero-accent">{t("rewards.heroAccent")}</span>{t("rewards.heroAfter")}
                    </h1>
                    <p className="rewards-hero-subtext rw-enter" style={delay(0.18)}>
                        {t("rewards.heroText")}
                    </p>
                    <div className="rewards-hero-facts">
                        <span className="rewards-fact rw-enter" style={delay(0.3)}>
                            <strong>{start.percent}%</strong>{t("rewards.fromFirst")}
                        </span>
                        <span className="rewards-fact rw-enter" style={delay(0.38)}>
                            {t("rewards.upTo")}<strong>{top.percent}%</strong>{t("rewards.asYouClimb")}
                        </span>
                        <span className="rewards-fact rw-enter" style={delay(0.46)}>
                            {t("rewards.spendableOn")}<strong>{t("rewards.anyGame")}</strong>
                        </span>
                    </div>
                    {/* Кнопок в шапке нет намеренно: здесь человек только узнаёт, что такое
                        кэшбэк. Путь в каталог — в конце трека уровней, когда выгода уже понятна. */}
                  </div>
                  <RewardsHeroScene />
                </div>
            </section>

            {/* Порядок — рассказ и ритм тёмное/светлое: обещание (тёмная шапка) → что это такое
                (светлый блок с живым заказом) → как выгода растёт (тёмная сцена пропуска) →
                посчитай для себя (светлая считалка) → правила. Пропуск сразу под шапкой был
                ошибкой: две тёмные секции сливались, два крупных заголовка спорили, а уровни
                показывались раньше, чем человек понял, что такое кэшбэк. */}
            <section className="container rewards-body rewards-body--intro">
                <div className={`rewards-what${shown(whatShown)}`} ref={whatRef}>
                    <CashbackOrderCard />
                    <div>
                        <span className="rewards-label">{t("rewards.notDiscount")}</span>
                        <h2>{t("rewards.moneyBack")}</h2>
                        <p className="muted">{t("rewards.moneyBackText1")}</p>
                        <p className="muted">{t("rewards.moneyBackText2")}</p>
                    </div>
                </div>
            </section>

            <CashbackPass />

            {/* После тёмного трека — белая пауза с ответом «где я это увижу». Считалки здесь
                нет намеренно: её посыл уже закрывают карточка заказа и трек. */}
            <CashbackWhere />

            <CashbackFaq />
        </div>
    );
};

export default RewardsPage;
