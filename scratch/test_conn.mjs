
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co'
const supabaseAnonKey = 'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  console.log('Testing connection to Supabase...')
  const { data, error } = await supabase.from('patients').select('id').limit(1)

  if (error) {
    console.error('Connection error:', error.message)
    process.exit(1)
  }

  console.log('Connection successful!')
  console.log('Found data:', data)
}

testConnection()
