import { Link } from 'react-router';
import { Box, Calculator, Layers, PenLine, Sofa, Sparkles } from 'lucide-react';

const FEATURES = [
  { icon: PenLine, title: 'План в 2D', text: 'Рисуйте стены по точным размерам — комнаты и площади считаются автоматически.' },
  { icon: Box, title: 'Мгновенное 3D', text: 'Один проект — две сцены. Переключайтесь в 3D и гуляйте по квартире от первого лица.' },
  { icon: Sofa, title: 'Каталог мебели', text: 'Перетаскивайте мебель на план, меняйте размеры, цвета и материалы.' },
  { icon: Calculator, title: 'Смета в тенге', text: 'Стоимость мебели, покрытий, дверей и окон — сразу в ₸.' },
  { icon: Layers, title: 'Этажи и версии', text: 'Несколько этажей, автосохранение в облаке и история версий.' },
  { icon: Sparkles, title: 'AI — скоро', text: 'Распознавание планов и AI-дизайнер интерьера на русском и казахском.' },
];

export default function Landing() {
  return (
    <div className="min-h-full bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-5">
        <div className="flex items-center gap-2 text-lg font-bold text-brand-600">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" /> SpacePlan
        </div>
        <div className="flex gap-2">
          <Link to="/login" className="btn-ghost">
            Войти
          </Link>
          <Link to="/register" className="btn-primary">
            Регистрация
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">Спроектируйте квартиру в 2D и 3D — без CAD</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Нарисуйте план, расставьте мебель, выберите материалы и посмотрите результат в 3D. Смета — в тенге.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/demo" className="btn-primary px-6 py-2.5 text-base">
            Попробовать без регистрации
          </Link>
          <Link to="/register" className="btn-outline px-6 py-2.5 text-base">
            Создать аккаунт
          </Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <f.icon className="text-brand-600" size={22} />
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
