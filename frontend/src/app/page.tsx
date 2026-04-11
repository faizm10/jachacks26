import { Hero } from "@/components/landing/hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { SiteHeader } from "@/components/landing/site-header";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hero-mesh" />
      <SiteHeader />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-4 pb-24 pt-28 sm:gap-20 sm:px-6 sm:pb-32 sm:pt-32">
        <Hero />
        <ProductPreview />
      </div>
    </div>
  );
}
