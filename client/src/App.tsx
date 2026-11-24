import { AnimatePresence, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { placeName } from './domain/place'
import { Header } from './features/Header'
import { Planner } from './features/planner/Planner'
import { Results } from './features/results/Results'
import { usePlanner } from './state/usePlanner'

const TITLE = document.title || 'Crosswind'

export default function App() {
  const { trip, change, errors, pending, submit, plan, clearPlan } = usePlanner()
  useEffect(() => {
    document.title = plan ? `${placeName(plan.origin.label)} to ${placeName(plan.destination.label)}: Crosswind` : TITLE
  }, [plan])
  return (
    <MotionConfig reducedMotion="user">
      <Header plan={plan} onChangeTrip={clearPlan} />
      <AnimatePresence mode="popLayout" initial={false}>
        {plan ?
          <Results key={plan.id} plan={plan} />
        : <Planner key="planner" trip={trip} errors={errors} pending={pending} onChange={change} onSubmit={submit} />}
      </AnimatePresence>
    </MotionConfig>
  )
}
