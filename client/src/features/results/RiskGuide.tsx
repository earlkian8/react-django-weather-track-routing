import { ChevronDown } from 'lucide-react'
import { RiskSign } from '../../art/RiskSign'
import { RISKS } from '../../domain/risk'
import styles from './RiskGuide.module.css'

const WIND = ['under 25', '25', '35', '45', '55']
const RAIN = ['under 0.10', '0.10', '0.25', '0.50', 'over 1.00']
const SNOW = ['under 0.5', '0.5', '1.0', '2.0', 'over 3.0']

export function RiskGuide() {
  return (
    <details className={styles.guide}>
      <summary>
        How risk is rated <ChevronDown size={18} aria-hidden />
      </summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Risk from</th>
            <th scope="col">Wind mph</th>
            <th scope="col">Rain in/hr</th>
            <th scope="col">Snow in/hr</th>
          </tr>
        </thead>
        <tbody>
          {RISKS.map((risk, i) => (
            <tr key={risk.key}>
              <th scope="row">
                <span>
                  <RiskSign risk={risk.key} size={17} decorative /> {risk.label}
                </span>
              </th>
              <td>{WIND[i]}</td>
              <td>{RAIN[i]}</td>
              <td>{SNOW[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        The worst of the three sets the risk. Wind counts for more when loaded: 35 mph is Severe above 40,000 lb, and 45 mph is No Travel
        above 30,000 lb. Gusts are shown but not rated.
      </p>
    </details>
  )
}
